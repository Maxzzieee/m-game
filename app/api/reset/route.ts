import { requireAuth } from "@/lib/session";
import { latestGame } from "@/lib/game";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";

// Start a new life: delete the current save. Cascades wipe events, npcs,
// seeds, and the arc journal (see schema foreign keys). The UI then drops
// back to the character-creation ceremony.
export async function POST() {
  const guard = await requireAuth();
  if (guard) return guard;

  const game = await latestGame();
  if (!game) return Response.json({ ok: true });

  const { error } = await db().from("games").delete().eq("id", game.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
