import { requireProfile } from "@/lib/session";
import { createGame, STEREOTYPES } from "@/lib/game";
import { d100 } from "@/lib/dice";
import { Stereotype } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireProfile();
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const name = typeof body.char_name === "string" ? body.char_name.trim() : "";
  const stereotype = body.stereotype as Stereotype;

  if (!name) return Response.json({ error: "name required" }, { status: 400 });
  if (!STEREOTYPES[stereotype]) return Response.json({ error: "bad stereotype" }, { status: 400 });

  // The two character-creation rolls happen server-side (auditable, like the d20).
  const ses_roll = d100();
  const looks_roll = d100();

  const game = await createGame({ profile: auth, char_name: name, stereotype, ses_roll, looks_roll });
  return Response.json({ game });
}
