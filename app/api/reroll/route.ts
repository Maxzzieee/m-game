import { requireProfile } from "@/lib/session";
import { latestGame } from "@/lib/game";
import { rollCheck } from "@/lib/dice";
import { getMeta, setMeta } from "@/lib/turn";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";

// Spend one HENG token to reroll the just-rolled check, BEFORE the consequence
// is narrated. Second roll stands (no take-best, no chaining) — that rule is
// what keeps fate feeling real. Both rolls stay in the story log.
export async function POST(req: Request) {
  const auth = await requireProfile();
  if (auth instanceof Response) return auth;

  const game = await latestGame(auth);
  if (!game) return Response.json({ error: "no game" }, { status: 400 });

  const meta = getMeta(game);
  const prev = meta.last_roll;
  if (!prev) return Response.json({ error: "nothing to reroll" }, { status: 400 });
  // Never let a heng be spent to reroll a roll that already WON. This is the
  // server-side backstop for the client rule "a win locks in" — it stops a
  // lagged/duplicate reroll request from clobbering a success into a failure.
  if (prev.outcome === "success" || prev.outcome === "nat20") {
    return Response.json({ dice: prev, heng: game.heng ?? 0, alreadyWon: true });
  }
  if ((game.heng ?? 0) < 1) return Response.json({ error: "no heng left" }, { status: 400 });

  // Physical-dice rerolls: same validation as /api/roll.
  let manual: number[] | undefined;
  const body = await req.json().catch(() => ({}));
  if (Array.isArray(body?.manual)) {
    const vals = body.manual
      .map((n: unknown) => (typeof n === "number" ? Math.round(n) : NaN))
      .filter((n: number) => Number.isInteger(n) && n >= 1 && n <= 20);
    const need = prev.mode === "advantage" || prev.mode === "disadvantage" ? 2 : 1;
    if (vals.length < need) {
      return Response.json(
        { error: need === 2 ? "this check needs two dice (1-20 each)" : "enter a number 1-20" },
        { status: 400 },
      );
    }
    manual = vals.slice(0, need);
  }

  // Reroll the same check (same stat, DC, and advantage mode).
  const dice = rollCheck(game, prev.stat, prev.dc, prev.mode ?? "normal", manual);
  if (manual?.length) dice.manual = true;

  // Spend the token and record the reroll transparently in the log.
  await db().from("games").update({ heng: game.heng - 1 }).eq("id", game.id);
  const seq = game.turn_no + 1;
  await db().from("events").insert({
    game_id: game.id,
    turn_no: seq,
    arc: game.arc,
    role: "player",
    prose: "(spends a heng token — rerolls)",
    dice,
    tags: ["heng"],
  });
  await db().from("games").update({ turn_no: seq }).eq("id", game.id);

  await setMeta(game.id, { last_roll: dice });

  return Response.json({ dice, heng: game.heng - 1 });
}
