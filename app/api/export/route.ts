import { requireProfile } from "@/lib/session";
import { latestGame } from "@/lib/game";
import { exportLife } from "@/lib/backup";
import { captureError } from "@/lib/log";

export const runtime = "nodejs";

// Download the whole life as a JSON file. Your save, in your hands.
export async function GET() {
  const auth = await requireProfile();
  if (auth instanceof Response) return auth;

  const game = await latestGame(auth);
  if (!game) return Response.json({ error: "no game" }, { status: 400 });

  try {
    const backup = await exportLife(game);
    const safeName = game.char_name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(backup, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="sg-life-${safeName}-${stamp}.json"`,
      },
    });
  } catch (err) {
    await captureError("api/export", err, { game_id: game.id, profile: auth });
    return Response.json({ error: "export failed" }, { status: 500 });
  }
}
