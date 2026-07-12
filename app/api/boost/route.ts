import { requireAuth } from "@/lib/session";
import { latestGame } from "@/lib/game";
import { getMeta } from "@/lib/turn";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";

const STATS = ["brains", "face", "brawn", "guts"] as const;

// Arc-transition growth: the player picks ONE stat to raise by +1 (cap +5).
export async function POST(req: Request) {
  const guard = await requireAuth();
  if (guard) return guard;

  const { stat } = await req.json().catch(() => ({}));
  if (!STATS.includes(stat)) return Response.json({ error: "bad stat" }, { status: 400 });

  const game = await latestGame();
  if (!game) return Response.json({ error: "no game" }, { status: 400 });
  if (!getMeta(game).pending_stat_boost) {
    return Response.json({ error: "no growth pending" }, { status: 400 });
  }

  const next = Math.min(5, (game[stat as (typeof STATS)[number]] as number) + 1);
  const meta = { ...(game.meta as Record<string, unknown>), pending_stat_boost: false };
  const { error } = await db()
    .from("games")
    .update({ [stat]: next, meta })
    .eq("id", game.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
