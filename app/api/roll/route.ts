import { requireProfile } from "@/lib/session";
import { latestGame } from "@/lib/game";
import { resolvePendingRoll } from "@/lib/turn";

export const runtime = "nodejs";

// Roll the pending check. Fast, no LLM — just the auditable server-side die.
// The client animates the result, then calls /api/turn?mode=resolve for the
// DM's consequence narration.
export async function POST() {
  const auth = await requireProfile();
  if (auth instanceof Response) return auth;

  const game = await latestGame(auth);
  if (!game) return Response.json({ error: "no game" }, { status: 400 });

  const dice = await resolvePendingRoll(game);
  if (!dice) return Response.json({ error: "no pending roll" }, { status: 400 });

  return Response.json({ dice });
}
