import { requireProfile } from "@/lib/session";
import { latestGame } from "@/lib/game";
import { improveMentalState, shopItem } from "@/lib/shop";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";

// Buy an item. Gear lands in games.items (rendered on the avatar); consumables
// apply their effect immediately. Money can't go negative at the till.
export async function POST(req: Request) {
  const auth = await requireProfile();
  if (auth instanceof Response) return auth;

  const { item: itemId } = await req.json().catch(() => ({}));
  const item = shopItem(String(itemId ?? ""));
  if (!item) return Response.json({ error: "no such item" }, { status: 400 });

  const game = await latestGame(auth);
  if (!game) return Response.json({ error: "no game" }, { status: 400 });

  if (item.kind === "gear" && game.items.includes(item.id)) {
    return Response.json({ error: "already owned" }, { status: 400 });
  }
  if (game.money < item.price) {
    return Response.json({ error: "not enough money lah" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { money: game.money - item.price };
  if (item.kind === "gear") {
    patch.items = [...game.items, item.id];
  } else {
    const next = improveMentalState(game.mental_state);
    if (next === game.mental_state) {
      return Response.json({ error: "you feel fine already" }, { status: 400 });
    }
    patch.mental_state = next;
  }

  const { error } = await db().from("games").update(patch).eq("id", game.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
