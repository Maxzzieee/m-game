import { requireProfile } from "@/lib/session";
import { db } from "@/lib/supabase";
import { captureError } from "@/lib/log";

export const runtime = "nodejs";

// Multiple lives per profile. A profile's games all share `profile == auth`;
// the most-recently-touched one is the "active" life the app loads (see
// latestGame). This route lists them, switches between them (by bumping
// updated_at via the games_touch trigger), and retires one (archive by
// renaming its profile, same mechanism as /api/reset).

export async function GET() {
  const auth = await requireProfile();
  if (auth instanceof Response) return auth;

  const { data, error } = await db()
    .from("games")
    .select("id, char_name, mode, arc, arc_name, age, ingame_date, updated_at")
    .eq("profile", auth)
    .order("updated_at", { ascending: false });

  if (error) {
    await captureError("api/lives GET", error, { profile: auth });
    return Response.json({ error: error.message }, { status: 500 });
  }
  // First row (newest updated_at) is the life currently in play.
  const lives = (data ?? []).map((g, i) => ({ ...g, active: i === 0 }));
  return Response.json({ lives });
}

export async function POST(req: Request) {
  const auth = await requireProfile();
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const action = body.action === "archive" ? "archive" : "switch";
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  // Ownership guard: only ever touch a game on this profile.
  const { data: owned } = await db()
    .from("games")
    .select("id")
    .eq("id", id)
    .eq("profile", auth)
    .maybeSingle();
  if (!owned) return Response.json({ error: "not found" }, { status: 404 });

  if (action === "archive") {
    const { error } = await db()
      .from("games")
      .update({ profile: `${auth}:archived-${Date.now()}` })
      .eq("id", id)
      .eq("profile", auth);
    if (error) {
      await captureError("api/lives archive", error, { id, profile: auth });
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ ok: true, archived: id });
  }

  // Switch: an idempotent update (profile → itself) fires games_touch, which
  // sets updated_at = now(), making this the most-recent = active life.
  const { error } = await db()
    .from("games")
    .update({ profile: auth })
    .eq("id", id)
    .eq("profile", auth);
  if (error) {
    await captureError("api/lives switch", error, { id, profile: auth });
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, active: id });
}
