import { requireAuth } from "@/lib/session";
import { latestGame } from "@/lib/game";
import { getMeta, runStoryTurn } from "@/lib/turn";

export const runtime = "nodejs";
export const maxDuration = 60;

// Advance the story one turn, streaming the DM's prose back as plain text.
// After the stream ends the client re-fetches /api/state for the updated sheet
// and any new pending roll.
//
// Body: { mode: "start" | "action" | "resolve", action?: string, big?: boolean }
export async function POST(req: Request) {
  const guard = await requireAuth();
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const mode = body.mode as "start" | "action" | "resolve";
  const big = !!body.big;

  const game = await latestGame();
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
  } else {
    modeArg = { kind: "start" as const };
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runStoryTurn(game, modeArg, {
          big: big || game.dm_model_pref === "big",
          onText: (chunk) => controller.enqueue(encoder.encode(chunk)),
        });
      } catch (err) {
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
