import { requireProfile } from "@/lib/session";
import { latestGame } from "@/lib/game";
import { captureError } from "@/lib/log";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";

// Start a new life. This used to hard-DELETE the save (cascading away every
// event, NPC, seed and journal entry) — one mis-click was unrecoverable, and
// it cost a real playthrough. Now the old life is ARCHIVED: parked under a
// dead profile so it vanishes from play but still exists in the DB, and can be
// restored by flipping `profile` back.
export async function POST() {
  const auth = await requireProfile();
  if (auth instanceof Response) return auth;

  const game = await latestGame(auth);
  if (!game) return Response.json({ ok: true });

  const { error } = await db()
    .from("games")
    .update({ profile: `${auth}:archived-${Date.now()}` })
    .eq("id", game.id);

  if (error) {
    await captureError("api/reset", error, { game_id: game.id, profile: auth });
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, archived: game.id });
}
