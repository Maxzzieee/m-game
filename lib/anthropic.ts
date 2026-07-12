import Anthropic from "@anthropic-ai/sdk";

// Server-side Anthropic client. Key stays server-side only.

let _client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY. Copy .env.example to .env.local and fill it in.");
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

// Model IDs — see the claude-api skill / models catalogue.
export const MODELS = {
  // DM narration. Sonnet 5: strong prose, cheap, fast streaming.
  dm: process.env.DM_MODEL || "claude-sonnet-5",
  // Big dramatic beats / arc finales.
  dmBig: process.env.DM_MODEL_BIG || "claude-opus-4-8",
  // Cheap compression for the summariser.
  summarizer: process.env.SUMMARIZER_MODEL || "claude-haiku-4-5",
  // World-sim (phase 2).
  worldsim: process.env.WORLDSIM_MODEL || "claude-sonnet-5",
} as const;

// The `record_turn` tool — the bridge between DM prose and the authoritative DB.
// Kept non-strict for flexible optional fields; state.ts parses defensively.
export const RECORD_TURN_TOOL: Anthropic.Tool = {
  name: "record_turn",
  description:
    "Record what changed this turn so the game database stays authoritative. Call exactly once at the end of every turn, after your prose. Report only what CHANGED; omit unchanged fields. Numeric stat/reputation/karma values are DELTAS.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "One terse line capturing this scene, for the memory log.",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description:
          "Entities/themes present: NPC names, location, and theme tags (fight, crush, exam, viral, family, money, ns, cca). Retrieval keys — always tag NPCs by name.",
      },
      awaiting_roll: {
        type: ["object", "null"],
        description: "Set when you presented a check and are waiting for the player to roll.",
        properties: {
          stat: { type: "string", description: "BRAINS | FACE | BRAWN | GUTS" },
          dc: { type: "integer" },
          reason: { type: "string", description: "What the roll is for, short." },
        },
      },
      stats: {
        type: "object",
        description: "Stat deltas.",
        properties: {
          brains: { type: "integer" },
          face: { type: "integer" },
          brawn: { type: "integer" },
          guts: { type: "integer" },
        },
      },
      reputation: {
        type: "object",
        description: "Reputation-axis deltas.",
        properties: {
          academic: { type: "integer" },
          social: { type: "integer" },
          street: { type: "integer" },
          family: { type: "integer" },
          system: { type: "integer" },
        },
      },
      karma: { type: "integer", description: "Hidden karma delta." },
      money: {
        type: "integer",
        description:
          "SGD delta to the player's pocket money — allowance, angbao, part-time pay, fines, spending on treats. Keep amounts age-appropriate and grounded.",
      },
      mental_state: {
        type: "string",
        enum: ["Fresh", "Tired", "Stress", "Burnt Out", "On Fire"],
        description: "Absolute new mental state, only if it changed.",
      },
      npc_changes: {
        type: "array",
        description: "NPC updates. Include archetype+hook for a brand-new NPC.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            relationship: { type: "integer", description: "Delta to the silent meter." },
            status: { type: "string", description: "active | left | estranged | dead" },
            note: { type: "string" },
            archetype: {
              type: "string",
              description: "ride_or_die | rival | mentor | wildcard | love_interest | minor",
            },
            hook: { type: "string" },
            hidden_motivation: { type: "string" },
          },
          required: ["name"],
        },
      },
      new_seed: {
        type: ["string", "null"],
        description: "Plant a butterfly seed (a decision that will pay off later).",
      },
      confirm_chop_used: {
        type: "boolean",
        description: "True if the player spent their Confirm Plus Chop this turn.",
      },
      advance: {
        type: ["object", "null"],
        description: "Only at an arc transition.",
        properties: {
          arc: { type: "integer" },
          arc_name: { type: "string" },
          age: { type: "integer" },
        },
      },
    },
    required: ["summary"],
  },
};
