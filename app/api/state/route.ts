import { requireAuth } from "@/lib/session";
import { latestGame } from "@/lib/game";
import { getActiveNpcs, getRecentEvents } from "@/lib/memory";
import { getMeta } from "@/lib/turn";

export const runtime = "nodejs";

// Snapshot of everything the UI needs to render: the character sheet, active
// NPCs, the visible transcript, and any pending dice roll.
export async function GET() {
  const guard = await requireAuth();
  if (guard) return guard;

  const game = await latestGame();
  if (!game) return Response.json({ game: null });

  const [npcs, recent] = await Promise.all([
    getActiveNpcs(game.id),
    getRecentEvents(game.id, 40),
  ]);
  const meta = getMeta(game);

  return Response.json({
    game,
    npcs,
    transcript: recent,
    awaiting_roll: meta.awaiting_roll ?? null,
  });
}
