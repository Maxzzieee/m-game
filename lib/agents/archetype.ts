import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODELS } from "../anthropic";

// "Write your own" archetype: the player describes the kid they were, and we
// derive stats from it. Same total budget as the presets (+4 across the four
// stats, each in -1..+3) so a custom archetype can't out-stat a preset.

export interface DerivedArchetype {
  label: string;
  flavour: string;
  brains: number;
  face: number;
  brawn: number;
  guts: number;
}

const TOOL: Anthropic.Tool = {
  name: "make_archetype",
  description: "Turn the player's self-description into a Singapore school archetype.",
  input_schema: {
    type: "object",
    properties: {
      label: {
        type: "string",
        description: "Archetype name, 'The ...' form, max 24 chars: 'The Quiet Artist'.",
      },
      flavour: {
        type: "string",
        description: "One first-person motto line in their voice, max 90 chars.",
      },
      brains: { type: "integer", description: "-1 to 3" },
      face: { type: "integer", description: "-1 to 3" },
      brawn: { type: "integer", description: "-1 to 3" },
      guts: { type: "integer", description: "-1 to 3" },
    },
    required: ["label", "flavour", "brains", "face", "brawn", "guts"],
  },
};

const clamp = (n: unknown, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, typeof n === "number" ? Math.round(n) : 0));

// Force the four stats to sum to exactly +4 while staying in -1..+3, adjusting
// the extremes first so the shape of the build survives.
function normalizeBudget(s: { brains: number; face: number; brawn: number; guts: number }) {
  const keys = ["brains", "face", "brawn", "guts"] as const;
  let sum = keys.reduce((a, k) => a + s[k], 0);
  let guard = 24;
  while (sum !== 4 && guard-- > 0) {
    if (sum > 4) {
      const k = keys.reduce((m, k2) => (s[k2] > s[m] ? k2 : m), keys[0]);
      if (s[k] > -1) s[k] -= 1;
    } else {
      const k = keys.reduce((m, k2) => (s[k2] < s[m] ? k2 : m), keys[0]);
      if (s[k] < 3) s[k] += 1;
    }
    sum = keys.reduce((a, k) => a + s[k], 0);
  }
  return s;
}

export async function deriveArchetype(description: string): Promise<DerivedArchetype> {
  const resp = await anthropic().messages.create({
    model: MODELS.summarizer,
    max_tokens: 300,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "make_archetype" },
    messages: [
      {
        role: "user",
        content: [
          "A player is creating a character for a Singapore secondary-school life sim,",
          "set in 2016, age 13. They described who they are:",
          "",
          `"${description.slice(0, 500)}"`,
          "",
          "Derive their archetype. Stats: BRAINS (books/logic), FACE (charisma/wayang),",
          "BRAWN (fitness), GUTS (nerve/resilience). Each -1..+3, and they MUST sum to",
          "exactly +4 (the standard budget — strengths imply weaknesses). Label in",
          "'The ...' form; flavour is a first-person motto in their own register.",
        ].join("\n"),
      },
    ],
  });

  const call = resp.content.find((b) => b.type === "tool_use");
  const raw = (call && call.type === "tool_use" ? call.input : {}) as Record<string, unknown>;

  const stats = normalizeBudget({
    brains: clamp(raw.brains, -1, 3),
    face: clamp(raw.face, -1, 3),
    brawn: clamp(raw.brawn, -1, 3),
    guts: clamp(raw.guts, -1, 3),
  });

  const label =
    typeof raw.label === "string" && raw.label.trim()
      ? raw.label.trim().slice(0, 24)
      : "The Original";
  const flavour =
    typeof raw.flavour === "string" && raw.flavour.trim()
      ? raw.flavour.trim().slice(0, 90)
      : "Cannot put me in a box one.";

  return { label, flavour, ...stats };
}
