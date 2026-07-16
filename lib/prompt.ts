import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { sgCalendar } from "./calendar";
import type {
  ArcJournal,
  DiceResult,
  Game,
  GameEvent,
  MoneyFlow,
  MoneyGoal,
  Npc,
  Pursuit,
  Seed,
} from "./types";

// One grounded line per SES tier so the DM always frames money in the life the
// player was born into — the emotional root of the whole money system.
function familyFinances(sesTier: string): string {
  const t = sesTier.toLowerCase();
  if (t.includes("rental"))
    return "money is tight — Ma counts coins, every dollar has a job, and asking for extra means guilt";
  if (t.includes("heartland") || t.includes("working"))
    return "comfortable but careful — no crises, but no 'just buy it' either; wants get weighed";
  if (t.includes("upgraded") || t.includes("middle"))
    return "steady — tuition and a family car, money rarely discussed at dinner, but not infinite";
  if (t.includes("condo") || t.includes("upper"))
    return "money is rarely the question — the pressure is to justify it, to not be the spoiled one";
  if (t.includes("landed") || t.includes("wealthy"))
    return "money is never the question — proving you're more than your parents' name is";
  return "an ordinary Singaporean household's money worries";
}

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
  nextBeat: { label: string; date: string } | null = null,
  lastChoices: { key: string; label: string }[] = [],
  flows: MoneyFlow[] = [],
  goals: MoneyGoal[] = [],
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
  lines.push(`FAMILY FINANCES: ${familyFinances(game.ses_tier)}`);

  if (flows.length) {
    const net = flows.reduce((s, f) => s + (f.monthly || 0), 0);
    lines.push("");
    lines.push("MONTHLY LEDGER (accrues automatically as time passes — don't report as one-off money):");
    for (const f of flows) {
      const sgn = f.monthly >= 0 ? "+" : "−";
      lines.push(`- ${f.name} (${f.kind}): ${sgn}$${Math.abs(f.monthly)}/mo`);
    }
    lines.push(`  NET: ${net >= 0 ? "+" : "−"}$${Math.abs(net)}/mo`);
  }

  const activeGoals = goals.filter((g) => g.status === "active");
  if (activeGoals.length) {
    lines.push("");
    lines.push("MONEY GOALS (the reason to hustle):");
    for (const g of activeGoals) {
      const overdue = g.deadline && g.deadline < game.ingame_date && g.saved < g.target;
      const by = g.deadline ? ` by ${g.deadline}` : "";
      const stk = g.stakes ? ` — if missed: ${g.stakes}` : "";
      lines.push(
        `- [${g.source}] ${g.label}: $${g.saved}/$${g.target}${by}${overdue ? " ⚠ OVERDUE — resolve it in a scene" : ""}${stk}`,
      );
    }
  }
  lines.push(`CALENDAR: ${sgCalendar(game.ingame_date, game.age).line}`);
  if (nextBeat) {
    lines.push(`NEXT BEAT: ${nextBeat.label} · ${nextBeat.date}`);
  } else {
    lines.push(
      "NEXT BEAT: none set — establish one this turn via next_beat (the next dated story milestone).",
    );
  }

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

  if (lastChoices.length) {
    lines.push("");
    lines.push(
      "LAST TURN'S MENU — the player has now acted. The scene has MOVED. Do NOT re-offer " +
        "these or their equivalents; if you find yourself writing the same options again, the " +
        "scene is stalling — cut forward in time or place instead:",
    );
    for (const c of lastChoices) lines.push(`- ${c.label}`);
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
  montage?: { span: "weeks" | "months" | "beat"; focus?: string } | null;
}): string {
  const parts = [opts.stateBlock];
  if (opts.memoriesBlock) parts.push(opts.memoriesBlock);
  if (opts.recentBlock) parts.push(opts.recentBlock);

  parts.push("=== THIS TURN ===");
  if (opts.montage) {
    const target =
      opts.montage.span === "beat"
        ? "up to the NEXT BEAT's date (stop at its doorstep — the beat itself is played live)"
        : opts.montage.span === "months"
          ? "about three months"
          : "a few weeks (about a month)";
    parts.push(
      [
        `MONTAGE: the player passes time — ${target}.`,
        opts.montage.focus
          ? `Their focus for this period: "${opts.montage.focus}".`
          : "No stated focus — let ordinary life fill the time.",
        "Write ONE compressed montage passage (150-350 words) using the time-skip-with-texture",
        "rule: named specifics, repetition with variation ('every Tuesday...', 'by the third week...'),",
        "seasons/festivals from CALENDAR passing through it. Advance ingame_date to the target",
        "(max 6 months). Apply CHUNKY but capped deltas for the whole period: total stat change",
        "at most ±1, total reputation at most ±2, money realistic, pursuit note (stage bump only",
        "if genuinely earned). Grinding costs mental state; rest restores it.",
        "INTERRUPT LICENCE: you MAY cut the montage short if something demands the player's",
        "attention — narrate up to that moment, set ingame_date to when it happens, and END",
        "INSIDE the live scene (normal choices/awaiting_roll rules apply from there). Use this",
        "when a seed, an NPC's hidden motivation, or a karma cash-in is ripe. Never montage",
        "through the NEXT BEAT or a pursuit threshold — stop at their doorstep.",
      ].join(" "),
    );
  } else if (opts.nudge) {
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
