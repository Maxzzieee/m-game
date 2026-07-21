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
      choices: {
        type: "array",
        description:
          "2-4 options for the player when the scene is open-ended. The app renders these as buttons — do NOT also print an A/B/C/D menu in your prose; end the prose on the dramatic beat instead. Omit when awaiting a roll or when the scene needs a free-text answer. INSIDE A MOMENT (see `moment`) every choice MUST be a concrete physical action or line in this exact instant ('Nutmeg him and go', 'Hold the eye contact', 'Ship the hotfix now') — never an abstract direction. Outside a Moment they can be life-level directions.",
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: "A, B, C or D" },
            label: {
              type: "string",
              description: "The option, one punchy line (max ~90 chars), player-voice.",
            },
          },
          required: ["key", "label"],
        },
      },
      scene: {
        type: ["object", "null"],
        description:
          "Where/when this scene is set — shown to the player as a scene header. Send when the location or time of day CHANGES (a new place, a time-skip, a cut). Omit if unchanged.",
        properties: {
          location: { type: "string", description: "e.g. 'Jalan Besar Stadium', 'the void deck'." },
          time_of_day: {
            type: "string",
            description: "e.g. 'Friday, ~9pm', 'just before dawn', 'lunch break'.",
          },
        },
      },
      moment: {
        type: ["object", "null"],
        description:
          "The MOMENT (zoom) control. A Moment is a bounded set-piece the player PLAYS OUT beat-by-beat in the present tense (the match, the audition, the demo day, the confession) instead of it being summarized. Send `{action:'enter', title, kind}` when the player chooses to LIVE a big moment — from then on stay in the present, no time-skips, embodied choices, NPCs reacting turn-by-turn, until it climaxes. Send `{action:'resolve'}` at the climax to zoom back out to the life layer and bank the consequences. Only one Moment at a time.",
        properties: {
          action: { type: "string", enum: ["enter", "resolve"] },
          title: { type: "string", description: "Short: 'The Match', 'SM audition — round 2'." },
          kind: {
            type: "string",
            description: "match | audition | build | confrontation | pitch | first-time | scene",
          },
        },
      },
      ingame_date: {
        type: "string",
        description:
          "Advance in-game time as scenes move: absolute 'YYYY-MM', never earlier than the current date. Small scenes may share a month; montages and holidays jump months.",
      },
      next_beat: {
        type: ["object", "null"],
        description:
          "ALWAYS maintain the next significant dated story moment (a trial, exams, a confession, enlistment). Shown to the player as their horizon; montages travel toward it. Only send when it changes.",
        properties: {
          label: { type: "string", description: "Short, evocative: 'Barca satellite trial'." },
          date: { type: "string", description: "'YYYY-MM', at or after the current date." },
        },
      },
      awaiting_roll: {
        type: ["object", "null"],
        description:
          "Set ONLY when the player has committed to an action and the die is next. Never while offering choices.",
        properties: {
          stat: { type: "string", description: "BRAINS | FACE | BRAWN | GUTS" },
          dc: { type: "integer" },
          reason: { type: "string", description: "What the roll is for, short." },
          mode: {
            type: "string",
            enum: ["normal", "advantage", "disadvantage"],
            description:
              "advantage = circumstances favour the player (they prepared, an ally helps, they exploit something they know). disadvantage = circumstances work against them (rushed, out of their depth, hostile audience). Default normal.",
          },
          mode_reason: {
            type: "string",
            description: "One short clause: why circumstances grant advantage/disadvantage.",
          },
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
          "SGD delta for a ONE-OFF event only: angbao, a fine, a big purchase, a windfall, a treat. Do NOT use this for regular salary or bills — those are recurring `ledger` items that accrue automatically as time passes.",
      },
      ledger: {
        type: "array",
        description:
          "Recurring income & expenses (see MONEY, HUSTLE & GOALS). Net accrues to the balance automatically as in-game time advances. Use when the fiction supports it: got a job/hustle, a business's monthly changes, parents ask for a monthly contribution, phone/transport bill, quit/closed.",
        items: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["add", "update", "end"] },
            kind: {
              type: "string",
              enum: ["job", "hustle", "business", "investment", "expense"],
            },
            name: { type: "string", description: "e.g. 'Weekend kopitiam job', 'Phone bill'." },
            monthly: {
              type: "integer",
              description: "SGD/month, SIGNED: income positive, expense negative. Ground it in the era.",
            },
            note: { type: "string" },
          },
          required: ["action", "name"],
        },
      },
      money_goals: {
        type: "array",
        description:
          "Money targets that give hustling a reason. `source: 'world'` = a pressure the world puts on the player (family need, a bill, the Dream's fee) — give it a deadline and stakes. `source: 'self'` = the player's own goal. Use `contribute` to move saved money toward one, `resolve` when it's met/failed/abandoned.",
        items: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["add", "contribute", "resolve"] },
            label: { type: "string", description: "e.g. 'Nike Mercurial boots', 'Help Ma with rent'." },
            target: { type: "integer", description: "SGD needed (for add)." },
            amount: { type: "integer", description: "SGD to set aside (for contribute)." },
            deadline: { type: "string", description: "YYYY-MM (world goals)." },
            source: { type: "string", enum: ["world", "self"] },
            stakes: { type: "string", description: "What happens if a world goal is missed." },
            outcome: { type: "string", enum: ["met", "failed", "abandoned"] },
            note: { type: "string" },
          },
          required: ["action", "label"],
        },
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
      pursuit: {
        type: ["object", "null"],
        description:
          "The player's declared life dream (see DREAMS ENGINE in the system prompt). Use `declare` when they commit to a new dream; move `stage` (absolute 0-6) only when a milestone is genuinely earned; `status` for transform/abandon/achieve.",
        properties: {
          declare: { type: "string", description: "New dream, short: 'professional footballer'." },
          stage: { type: "integer", description: "Absolute ladder stage 0-6." },
          status: {
            type: "string",
            enum: ["active", "achieved", "transformed", "abandoned"],
          },
          next_milestone: {
            type: "string",
            description: "What reaching the NEXT stage concretely looks like.",
          },
          note: { type: "string", description: "Latest development in the pursuit, one line." },
        },
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
