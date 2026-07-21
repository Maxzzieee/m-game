import { requireProfile } from "@/lib/session";
import { createGame, STEREOTYPES } from "@/lib/game";
import { deriveArchetype } from "@/lib/agents/archetype";
import { d100 } from "@/lib/dice";
import type { Stereotype } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// Create a character from either a preset stereotype or a free-text
// self-description ("custom"), whose stats the archetype agent derives on the
// same +4 budget as the presets.
export async function POST(req: Request) {
  const auth = await requireProfile();
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const name = typeof body.char_name === "string" ? body.char_name.trim() : "";
  if (!name) return Response.json({ error: "name required" }, { status: 400 });

  const mode = body.mode === "sandbox" ? "sandbox" : "story";
  const dream = typeof body.dream === "string" ? body.dream.trim() : "";

  let label: string;
  let flavour: string;
  let stats: { brains: number; face: number; brawn: number; guts: number };

  const custom = typeof body.custom === "string" ? body.custom.trim() : "";
  if (custom) {
    const derived = await deriveArchetype(custom);
    label = derived.label;
    flavour = derived.flavour;
    stats = {
      brains: derived.brains,
      face: derived.face,
      brawn: derived.brawn,
      guts: derived.guts,
    };
  } else {
    const stereotype = body.stereotype as Stereotype;
    const preset = STEREOTYPES[stereotype];
    if (!preset) return Response.json({ error: "bad stereotype" }, { status: 400 });
    label = stereotype;
    flavour = preset.flavour;
    stats = {
      brains: preset.brains,
      face: preset.face,
      brawn: preset.brawn,
      guts: preset.guts,
    };
  }

  // The two fate rolls happen server-side (auditable, like the d20).
  const game = await createGame({
    profile: auth,
    mode,
    dream,
    char_name: name,
    label,
    flavour,
    stats,
    ses_roll: d100(),
    looks_roll: d100(),
  });
  return Response.json({ game });
}
