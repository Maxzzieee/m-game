import { requireProfile } from "@/lib/session";
import { latestGame } from "@/lib/game";
import { importLife, type LifeBackup } from "@/lib/backup";
import { captureError } from "@/lib/log";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

// Restore a life from an exported JSON file. The current save for this profile
// is archived (renamed, not deleted) rather than destroyed — this app has
// already eaten one life; it won't eat another.
export async function POST(req: Request) {
  const auth = await requireProfile();
  if (auth instanceof Response) return auth;

  let backup: LifeBackup;
  try {
    backup = (await req.json()) as LifeBackup;
  } catch {
    return Response.json({ error: "that file isn't valid JSON" }, { status: 400 });
  }

  try {
    // Park the existing save under a dead profile instead of deleting it.
    const current = await latestGame(auth);
    if (current) {
      await db()
        .from("games")
        .update({ profile: `${auth}:replaced-${Date.now()}` })
        .eq("id", current.id);
    }

    const gameId = await importLife(backup, auth);
    return Response.json({ ok: true, game_id: gameId });
  } catch (err) {
    await captureError("api/import", err, { profile: auth });
    return Response.json(
      { error: err instanceof Error ? err.message : "import failed" },
      { status: 400 },
    );
  }
}
