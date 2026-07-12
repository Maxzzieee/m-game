import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { sgCalendar } from "./calendar";
import { ArcJournal, DiceResult, Game, GameEvent, Npc, Pursuit, Seed } from "./types";

export const PURSUIT_STAGES = [
  "SPARK",
  "FIRST PROOF",
  "GATEKEEPER CLASH",
  "THE GRIND",
  "THE THRESHOLD",
  "THE LIFE",
  "THE SUMMIT",
] as const;

// The frozen SSOT is the cached prefix. Read once, kept in module memory.
let _ssot: string | null = null;
export function loadSsot(): string {
  if (_ssot) return _ssot;
  const p = path.join(process.cwd(), "prompts", "ssot.md");
  _ssot = fs.readFileSync(p, "utf8");
  return _ssot;
}

// ---- context blocks (volatile, injected per-turn, after the cache breakpoint) ----

function statLine(game: Game): string {
  return `BRAINS ${sign(game.brains)}  FACE ${sign(game.face)}  BRAWN ${sign(
    game.brawn,
  )}  GUTS ${sign(game.guts)}`;
}
function repLine(game: Game): string {
  return `Academic ${sign(game.rep_academic)}  Social ${sign(game.rep_social)}  Street ${sign(
    game.rep_street,
  )}  Family ${sign(game.rep_family)}  System ${sign(game.rep_system)}`;
}
const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export function buildStateBlock(
  game: Game,
  npcs: Npc[],
  seeds: Seed[],
  journal: ArcJournal | null,
  karmaCashIn: "good" | "bad" | null,
  worldNotes: string[] = [],
  pastCanon: string[] = [],
  pursuit: Pursuit | null = null,
  sceneHook: string | null = null,
): string {
  const lines: string[] = [];
  lines.push("=== GAME STATE (authoritative — trust this over your own memory) ===");
  lines.push(
    `${game.char_name}, age ${game.age} — Arc ${game.arc}: ${game.arc_name} (${game.ingame_date})`,
  );
  lines.push(`Stereotype: ${game.stereotype} | SES: ${game.ses_tier} | Looks: ${game.looks_tier}`);
  lines.push(`Stats: ${statLine(game)}`);
  lines.push(`Reputation: ${repLine(game)}`);
  lines.push(`Mental state: ${game.mental_state}`);
  lines.push(`Pocket money: $${game.money}${game.money < 0 ? " (IN DEBT)" : ""}`);
  lines.push(`Confirm Plus Chop: ${game.confirm_chop ? "AVAILABLE this arc" : "used"}`);
  lines.push(`CALENDAR: ${sgCalendar(game.ingame_date, game.age).line}`);

  if (pursuit) {
    const stageName = PURSUIT_STAGES[Math.min(6, Math.max(0, pursuit.stage))];
    lines.push(
      `DREAM: ${pursuit.dream} — stage ${pursuit.stage}/6 ${stageName}` +
        (pursuit.next_milestone ? `; next milestone: ${pursuit.next_milestone}` : "") +
        (pursuit.note ? `; latest: ${pursuit.note}` : ""),
    );
  }

  if (npcs.length) {
    lines.push("");
    lines.push("Active NPCs (relationship meter is hidden from the player):");
    for (const n of npcs) {
      const motiv = n.hidden_motivation ? ` [hidden: ${n.hidden_motivation}]` : "";
      lines.push(
        `- ${n.name} (${n.archetype}, ${n.status}, meter ${sign(n.relationship)}): ${n.hook}${motiv}`,
      );
    }
  }

  if (seeds.length) {
    lines.push("");
    lines.push("Pending butterfly seeds (pay these off when the moment is right):");
    for (const s of seeds) lines.push(`- (arc ${s.arc_created}) ${s.description}`);
  }

  if (pastCanon.length) {
    lines.push("");
    lines.push("LIFE CANON (closed arcs — never contradict these):");
    for (const c of pastCanon) lines.push(c);
  }

  if (journal?.body) {
    lines.push("");
    lines.push("Arc journal so far (compressed earlier events):");
    lines.push(journal.body);
  }

  if (worldNotes.length) {
    lines.push("");
    lines.push("OFFSCREEN, since the last session (weave in as lived reality, never a bulletin):");
    for (const n of worldNotes) lines.push(`- ${n}`);
  }

  if (sceneHook) {
    lines.push("");
    lines.push(`SCENE HOOK (the world comes to the player — open with this intrusion): ${sceneHook}`);
  }

  if (karmaCashIn) {
    lines.push("");
    lines.push(
      karmaCashIn === "good"
        ? "KARMA: a good-karma cash-in is due — land a lucky break this turn, narrated as coincidence."
        : "KARMA: a bad-karma cash-in is due — a past wrong resurfaces at the worst time, narrated as coincidence.",
    );
  }

  return lines.join("\n");
}

export function buildMemoriesBlock(memories: GameEvent[]): string {
  if (!memories.length) return "";
  const lines = ["=== MEMORIES (older scenes relevant to what's happening now) ==="];
  for (const m of memories) {
    lines.push(`- (turn ${m.turn_no}) ${m.summary ?? m.prose.slice(0, 160)}`);
  }
  return lines.join("\n");
}

export function buildRecentBlock(events: GameEvent[]): string {
  if (!events.length) return "";
  const lines = ["=== RECENT SCENES (most recent last) ==="];
  for (const e of events) {
    if (e.role === "player") {
      lines.push(`PLAYER: ${e.prose}`);
      if (e.dice) lines.push(`  [rolled ${diceLine(e.dice)}]`);
    } else {
      lines.push(`DM: ${e.prose}`);
    }
  }
  return lines.join("\n");
}

export function diceLine(d: DiceResult): string {
  const modeBit =
    d.mode && d.mode !== "normal" && d.d20b !== null
      ? ` [${d.mode}: rolled ${d.d20} & ${d.d20b}, kept ${d.d20}]`
      : "";
  return `${d.stat} check DC ${d.dc}: d20 ${d.d20}${modeBit} ${sign(d.statMod)} stat ${sign(
    d.stateMod,
  )} state = ${d.total} → ${d.outcome.toUpperCase()} (margin ${sign(d.margin)})`;
}

// Assemble the single per-turn user message from DB-owned context + the player's
// action. We deliberately do NOT resend prior assistant turns as real message
// history — the RECENT/MEMORIES blocks stand in for them, keeping prompt size
// bounded and defeating context fatigue.
export function buildUserMessage(opts: {
  stateBlock: string;
  memoriesBlock: string;
  recentBlock: string;
  playerAction: string; // "" for the very first scene
  diceResult?: DiceResult | null;
  nudge?: boolean; // NPC-initiated scene: the world moves first
}): string {
  const parts = [opts.stateBlock];
  if (opts.memoriesBlock) parts.push(opts.memoriesBlock);
  if (opts.recentBlock) parts.push(opts.recentBlock);

  parts.push("=== THIS TURN ===");
  if (opts.nudge) {
    parts.push(
      "The player is present but hasn't acted — the world moves first. Open the scene with " +
        "the SCENE HOOK intrusion from GAME STATE (or, if none, a small believable " +
        "NPC-initiated moment). Land the intrusion, let it breathe, then hand control back " +
        "to the player with choices.",
    );
  } else if (opts.diceResult) {
    parts.push(
      `The player rolled. Result: ${diceLine(opts.diceResult)}. Narrate the consequence, ` +
        `honouring Nat 1 / Nat 20 (something EXTRA), then offer the next choices.`,
    );
  } else if (opts.playerAction.trim()) {
    parts.push(`Player action: ${opts.playerAction.trim()}`);
    parts.push(
      "Narrate what happens. If a meaningful check is warranted, present it (stat + DC) and " +
        "set awaiting_roll — then stop, do not resolve it yourself.",
    );
  } else {
    parts.push(
      "Open the game. Cold-open a Secondary 1 Orientation Day morning — the school hall, " +
        "plastic chairs, a principal droning into a microphone, the new uniform still stiff and " +
        "smelling of packaging. Ground it, introduce the moment, then offer the first choices.",
    );
  }
  parts.push("End your turn by calling record_turn.");
  return parts.join("\n\n");
}

// Build the system param with a cache breakpoint so the SSOT + tools are cached.
export function systemParam(): Anthropic.MessageCreateParams["system"] {
  return [
    {
      type: "text",
      text: loadSsot(),
      cache_control: { type: "ephemeral" },
    },
  ];
}
