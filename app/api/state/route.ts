import { requireProfile } from "@/lib/session";
import { latestGame } from "@/lib/game";
import { getActiveNpcs, getActivePursuit, getRecentEvents } from "@/lib/memory";
import { getFlows, getGoals } from "@/lib/money";
import { getMeta } from "@/lib/turn";

export const runtime = "nodejs";

// Snapshot of everything the UI needs to render: the character sheet, active
// NPCs, the visible transcript, and any pending dice roll.
export async function GET() {
  const auth = await requireProfile();
  if (auth instanceof Response) return auth;

  const game = await latestGame(auth);
  if (!game) return Response.json({ game: null });

  const [npcs, recent, pursuit, flows, goals] = await Promise.all([
    getActiveNpcs(game.id),
    getRecentEvents(game.id, 40),
    getActivePursuit(game.id),
    getFlows(game.id),
    getGoals(game.id),
  ]);
  const meta = getMeta(game);

  return Response.json({
    game,
    npcs,
    transcript: recent,
    awaiting_roll: meta.awaiting_roll ?? null,
    pending_stat_boost: meta.pending_stat_boost ?? false,
    choices: meta.choices ?? null,
    scene_hook: meta.scene_hook ?? null,
    next_beat: meta.next_beat ?? null,
    pursuit,
    flows,
    goals,
  });
}
