import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODELS } from "../anthropic";
import { getActiveNpcs, getArcJournal, getPendingSeeds } from "../memory";
import { db } from "../supabase";
import { Game } from "../types";

// The World-Sim agent: runs when the player returns after a real-world gap.
// It advances NPC lives OFFSCREEN — quiet developments, rumours, a new seed —
// and leaves notes in game.meta.world_notes for the DM to weave into the next
// scene as lived reality. On-demand and cheap: one small Sonnet call per
// returning session, never a cron.

const GAP_HOURS = 8; // real-world hours away before the world moves
const MIN_TURNS = 6; // don't simulate before the story has any footing

const WORLDSIM_TOOL: Anthropic.Tool = {
  name: "record_world",
  description: "Record what happened offscreen while the player was away.",
  input_schema: {
    type: "object",
    properties: {
      developments: {
        type: "array",
        description:
          "1-3 small offscreen developments. Grounded, generational, consequential-later. Each names an existing NPC or a believable force in their world (a teacher, a parent, the class group chat).",
        items: { type: "string" },
      },
      npc_meter_shifts: {
        type: "array",
        description: "Optional silent relationship shifts caused by offscreen events.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            delta: { type: "integer" },
          },
          required: ["name", "delta"],
        },
      },
      new_seed: {
        type: ["string", "null"],
        description: "Optionally plant ONE butterfly seed from the offscreen world.",
      },
      hook: {
        type: ["string", "null"],
        description:
          "Optionally, ONE scene intrusion where the world comes to the player: an NPC at the door, an urgent text, a summons. One vivid line, present tense ('Farhan hammering on the door at 9pm, eyes red'). Use sparingly — only when a development genuinely demands the player's attention NOW.",
      },
    },
    required: ["developments"],
  },
};

export async function maybeRunWorldSim(game: Game): Promise<boolean> {
  if (game.turn_no < MIN_TURNS) return false;

  const meta = (game.meta ?? {}) as Record<string, unknown>;
  if (meta.world_notes) return false; // unconsumed notes already waiting

  // Gap since the last activity on this save.
  const last = new Date(game.updated_at).getTime();
  const hoursAway = (Date.now() - last) / 36e5;
  if (hoursAway < GAP_HOURS) return false;

  const [npcs, seeds, journal] = await Promise.all([
    getActiveNpcs(game.id),
    getPendingSeeds(game.id),
    getArcJournal(game.id, game.arc),
  ]);
  if (npcs.length === 0) return false;

  const prompt = [
    `You are the offscreen world of a Singapore life-sim. The player (${game.char_name}, age ${game.age}, arc ${game.arc}: ${game.arc_name}, in-game ${game.ingame_date}) has been away for ~${Math.round(hoursAway)} hours of real time — a few in-game days.`,
    "",
    "CAST (name, archetype, relationship meter, hook, hidden motivation):",
    ...npcs.map(
      (n) =>
        `- ${n.name} (${n.archetype}, meter ${n.relationship}): ${n.hook}${n.hidden_motivation ? ` [hidden: ${n.hidden_motivation}]` : ""}`,
    ),
    "",
    seeds.length ? "PENDING SEEDS:\n" + seeds.map((s) => `- ${s.description}`).join("\n") : "",
    journal?.body ? "STORY SO FAR:\n" + journal.body : "",
    "",
    "Advance their lives a small, believable step. Prefer developments that leak NPCs' hidden motivations through behaviour, complicate a pending seed, or set up a future scene. Nothing world-shaking; the good stuff is small and human. Call record_world.",
  ]
    .filter(Boolean)
    .join("\n");

  const resp = await anthropic().messages.create({
    model: MODELS.worldsim,
    max_tokens: 700,
    tools: [WORLDSIM_TOOL],
    tool_choice: { type: "tool", name: "record_world" },
    messages: [{ role: "user", content: prompt }],
  });

  const call = resp.content.find((b) => b.type === "tool_use");
  if (!call || call.type !== "tool_use") return false;
  const out = call.input as {
    developments?: string[];
    npc_meter_shifts?: Array<{ name: string; delta: number }>;
    new_seed?: string | null;
    hook?: string | null;
  };

  // Apply silent meter shifts.
  for (const shift of out.npc_meter_shifts ?? []) {
    const npc = npcs.find((n) => n.name.toLowerCase() === shift.name.toLowerCase());
    if (!npc || typeof shift.delta !== "number") continue;
    const next = Math.max(-5, Math.min(5, npc.relationship + shift.delta));
    await db().from("npcs").update({ relationship: next }).eq("id", npc.id);
  }

  // Plant the seed.
  if (out.new_seed) {
    await db().from("seeds").insert({
      game_id: game.id,
      description: out.new_seed,
      arc_created: game.arc,
      tags: ["worldsim"],
    });
  }

  // Leave the notes (and any scene intrusion) for the DM's next scene.
  const notes = (out.developments ?? []).filter((d) => typeof d === "string" && d.trim());
  const hook = typeof out.hook === "string" && out.hook.trim() ? out.hook.trim() : null;
  if (notes.length || hook) {
    await db()
      .from("games")
      .update({
        meta: {
          ...meta,
          ...(notes.length ? { world_notes: notes } : {}),
          ...(hook ? { scene_hook: hook } : {}),
        },
      })
      .eq("id", game.id);
  }

  return notes.length > 0 || hook !== null;
}
