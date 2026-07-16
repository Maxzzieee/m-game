import { requireProfile } from "@/lib/session";
import { latestGame } from "@/lib/game";
import { getActivePursuit } from "@/lib/memory";
import { captureError } from "@/lib/log";
import { MARK_BOOKKEEPING, MARK_STATE, type InlineState } from "@/lib/protocol";
import { getMeta, runStoryTurn } from "@/lib/turn";

export const runtime = "nodejs";
export const maxDuration = 60;

// Advance the story one turn, streaming the DM's prose back as plain text.
// After the stream ends the client re-fetches /api/state for the updated sheet
// and any new pending roll.
//
// Body: { mode: "start" | "action" | "resolve", action?: string, big?: boolean }
export async function POST(req: Request) {
  const auth = await requireProfile();
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const mode = body.mode as "start" | "action" | "resolve" | "nudge" | "montage";
  const big = !!body.big;

  const game = await latestGame(auth);
  if (!game) return Response.json({ error: "no game" }, { status: 400 });

  // Build the mode object.
  let modeArg;
  if (mode === "resolve") {
    const dice = getMeta(game).last_roll;
    if (!dice) return Response.json({ error: "no roll to resolve" }, { status: 400 });
    modeArg = { kind: "resolve" as const, dice };
  } else if (mode === "action") {
    const action = typeof body.action === "string" ? body.action : "";
    if (!action.trim()) return Response.json({ error: "empty action" }, { status: 400 });
    modeArg = { kind: "action" as const, action };
  } else if (mode === "nudge") {
    modeArg = { kind: "nudge" as const };
  } else if (mode === "montage") {
    const span = ["weeks", "months", "beat"].includes(body.span) ? body.span : "weeks";
    const focus =
      typeof body.focus === "string" && body.focus.trim()
        ? body.focus.trim().slice(0, 200)
        : undefined;
    modeArg = { kind: "montage" as const, span: span as "weeks" | "months" | "beat", focus };
  } else {
    modeArg = { kind: "start" as const };
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { game: updated } = await runStoryTurn(game, modeArg, {
          big: big || game.dm_model_pref === "big",
          onText: (chunk) => controller.enqueue(encoder.encode(chunk)),
          // Prose done, tool call generating — let the UI show skeletons.
          onToolStart: () => controller.enqueue(encoder.encode(MARK_BOOKKEEPING)),
        });
        // Inline the fresh state so the client renders choices instantly,
        // without waiting on a second /api/state round trip.
        const meta = getMeta(updated);
        const pursuit = await getActivePursuit(updated.id);
        const payload: InlineState = {
          game: updated,
          awaiting_roll: meta.awaiting_roll ?? null,
          choices: meta.choices ?? null,
          next_beat: meta.next_beat ?? null,
          scene_hook: meta.scene_hook ?? null,
          pursuit,
        };
        controller.enqueue(encoder.encode(MARK_STATE + JSON.stringify(payload)));
      } catch (err) {
        await captureError("api/turn", err, {
          game_id: game.id,
          profile: auth,
          mode: modeArg.kind,
        });
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(`\n\n[the DM stumbled: ${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
