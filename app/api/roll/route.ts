import { requireProfile } from "@/lib/session";
import { latestGame } from "@/lib/game";
import { getMeta, resolvePendingRoll } from "@/lib/turn";

export const runtime = "nodejs";

// Roll the pending check. Fast, no LLM — just the auditable server-side die.
// Body (optional): { manual: number[] } — the player rolled PHYSICAL dice and
// entered the result(s): one value normally, two under advantage/disadvantage.
// The client animates the result, then calls /api/turn mode=resolve.
export async function POST(req: Request) {
  const auth = await requireProfile();
  if (auth instanceof Response) return auth;

  const game = await latestGame(auth);
  if (!game) return Response.json({ error: "no game" }, { status: 400 });

  // Validate manual dice against the pending check's mode.
  let manual: number[] | undefined;
  const body = await req.json().catch(() => ({}));
  if (Array.isArray(body?.manual)) {
    const vals = body.manual
      .map((n: unknown) => (typeof n === "number" ? Math.round(n) : NaN))
      .filter((n: number) => Number.isInteger(n) && n >= 1 && n <= 20);
    const pending = getMeta(game).awaiting_roll;
    const need = pending?.mode === "advantage" || pending?.mode === "disadvantage" ? 2 : 1;
    if (vals.length < need) {
      return Response.json(
        { error: need === 2 ? "this check needs two dice (1-20 each)" : "enter a number 1-20" },
        { status: 400 },
      );
    }
    manual = vals.slice(0, need);
  }

  const dice = await resolvePendingRoll(game, manual);
  if (!dice) return Response.json({ error: "no pending roll" }, { status: 400 });

  return Response.json({ dice });
}
