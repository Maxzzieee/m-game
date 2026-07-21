import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { sgCalendar } from "./calendar";
import type {
  ArcJournal,
  DiceResult,
  Game,
  GameEvent,
  GameMode,
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
  focusNpcNames: string[] = [], // NPCs present/mentioned now — kept in full detail
): string {
  const lines: string[] = [];
  lines.push("=== GAME STATE (authoritative — trust this over your own memory) ===");
  if (game.mode === "sandbox") {
    lines.push(
      "MODE: SANDBOX — Wishgranter. NO dice/DCs/failure. When the player speaks a want, " +
        "DON'T grant it yet: WARN them of the counteractive cost (~half the wish) and offer " +
        "take-it / leave-it choices; GRANT only if they accept. Never pre-offer dreams as " +
        "menu options. Never set awaiting_roll. See § WISHGRANTER.",
    );
  } else {
    lines.push("MODE: STORY");
  }
  // Scene + Moment orientation, so the DM always knows where/when we are and
  // whether we're zoomed into a lived set-piece.
  const gm = game.meta as {
    scene?: { location?: string; time_of_day?: string } | null;
    moment?: { title?: string; active?: boolean } | null;
    date_anchor_turn?: number;
  };
  if (gm?.scene && (gm.scene.location || gm.scene.time_of_day)) {
    lines.push(`SCENE: ${[gm.scene.location, gm.scene.time_of_day].filter(Boolean).join(" · ")}`);
  }
  if (gm?.moment?.active) {
    lines.push(
      `INSIDE A MOMENT: "${gm.moment.title}" — play it out present-tense, beat-by-beat, ` +
        "embodied choices only; emit moment:{action:'resolve'} at its climax to zoom out.",
    );
  }
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
  // Frozen-clock guard: a life spans years, but the clock only moves when the DM
  // advances ingame_date. If it's been stuck for many turns (and we're not
  // inside a Moment, where staying put is correct), force it forward.
  if (!gm?.moment?.active) {
    const frozenFor = game.turn_no - (gm?.date_anchor_turn ?? 0);
    if (frozenFor > 16) {
      lines.push(
        `⚠ TIME IS FROZEN: the date has not moved for ${frozenFor} turns (still ${game.ingame_date}, ` +
          `age ${game.age}). A whole life is ~250 scenes across years — you are far behind. ADVANCE ` +
          `ingame_date THIS TURN (skip forward weeks or months as fits — end the scene, cut ahead, ` +
          `montage if needed), age the character as time passes, and emit \`advance\` at a life-stage ` +
          `boundary (end of secondary school, JC/poly, NS, work). Do not keep the player frozen.`,
      );
    }
  }
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
    // Bound the roster: only the people who matter RIGHT NOW get full detail —
    // whoever's in the scene, then strongest bonds, then most recent. The rest
    // are listed as bare names (their detail lives in the journal/canon). An
    // unbounded cast is the main thing that makes the model confuse and invent
    // people, and it's a big per-turn token sink.
    const focus = new Set(focusNpcNames.map((s) => s.toLowerCase()));
    const ranked = [...npcs].sort((a, b) => {
      const af = focus.has(a.name.toLowerCase()) ? 1 : 0;
      const bf = focus.has(b.name.toLowerCase()) ? 1 : 0;
      if (af !== bf) return bf - af;
      const ar = Math.abs(a.relationship);
      const br = Math.abs(b.relationship);
      if (ar !== br) return br - ar;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
    const DETAIL = 6;
    const shown = ranked.slice(0, DETAIL);
    const rest = ranked.slice(DETAIL);
    lines.push("");
    lines.push("People who matter right now (relationship meter is hidden from the player):");
    shown.forEach((n, i) => {
      // hidden motivation only for the closest few / whoever's here — spoilery
      // and token-heavy for the whole cast.
      const keepMotiv = (i < 3 || focus.has(n.name.toLowerCase())) && n.hidden_motivation;
      const motiv = keepMotiv ? ` [hidden: ${n.hidden_motivation}]` : "";
      lines.push(
        `- ${n.name} (${n.archetype}, ${n.status}, meter ${sign(n.relationship)}): ${n.hook}${motiv}`,
      );
    });
    if (rest.length) {
      lines.push(
        `Others you know (pull their detail from the journal/canon if they return): ${rest
          .map((n) => n.name)
          .join(", ")}`,
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

  // Anti-repeat guard. Outside a Moment: the scene has moved, cut forward if
  // you'd repeat. Inside a Moment: DON'T cut away (staying is the point) but
  // still ADVANCE the beat — never re-offer the same options.
  if (lastChoices.length) {
    lines.push("");
    lines.push(
      gm?.moment?.active
        ? "LAST BEAT'S OPTIONS — the player just acted. ADVANCE the moment (a new beat, an NPC " +
            "reacts, the stakes tighten). Do NOT re-offer these same options, and do NOT cut " +
            "away — stay in the present until it climaxes:"
        : "LAST TURN'S MENU — the player has now acted. The scene has MOVED. Do NOT re-offer " +
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
  // Keep the last few DM scenes verbatim (the immediate moment needs the exact
  // words); older DM scenes collapse to their one-line summary. Player lines are
  // short, so they stay whole. This roughly halves the per-turn recent-block
  // tokens without losing the thread — the biggest single cost + bloat lever.
  const FULL_DM = 5;
  const cut = Math.max(0, events.length - FULL_DM);
  events.forEach((e, i) => {
    if (e.role === "player") {
      lines.push(`PLAYER: ${e.prose}`);
      if (e.dice) lines.push(`  [rolled ${diceLine(e.dice)}]`);
    } else {
      const body = i >= cut ? e.prose : (e.summary ?? e.prose.slice(0, 140));
      lines.push(`DM: ${body}`);
    }
  });
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
  mode?: GameMode; // shapes the cold-open
  activeMoment?: { title: string } | null; // inside a zoomed-in Moment right now
  openingDream?: string | null; // sandbox: the founding dream to open the life from
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
  } else if (opts.activeMoment) {
    // INSIDE a zoomed-in Moment — play it beat-by-beat (§ INHABIT THE MOMENT).
    parts.push(
      `You are INSIDE a MOMENT: "${opts.activeMoment.title}".` +
        (opts.playerAction.trim() ? ` The player just did: ${opts.playerAction.trim()}.` : "") +
        (opts.diceResult ? ` (The die came up: ${diceLine(opts.diceResult)} — honour it in the beat.)` : ""),
    );
    parts.push(
      "Stay fully in the PRESENT TENSE, second person, moment-to-moment. Do NOT cut away, " +
        "montage, summarize, or skip time. Sustain the senses; let anyone here speak and react " +
        "turn-by-turn with subtext. Every choice MUST be a concrete physical action or line in " +
        "THIS instant — never an abstract direction. Play it beat-by-beat until it reaches its " +
        "natural climax; then, and ONLY then, emit moment:{action:'resolve'} to zoom back out " +
        "to the life layer and bank the consequences.",
    );
  } else if (opts.diceResult) {
    parts.push(
      `The player rolled. Result: ${diceLine(opts.diceResult)}. Narrate the consequence, ` +
        `honouring Nat 1 / Nat 20 (something EXTRA), then offer the next choices.`,
    );
  } else if (opts.playerAction.trim()) {
    parts.push(`Player action: ${opts.playerAction.trim()}`);
    parts.push(
      "Narrate it in the PRESENT, embodied — second person, at least one live physical " +
        "sensation, and stay IN the moment rather than reporting it from outside. Let anyone " +
        "present speak and react. End on a live beat: offer embodied choices or ask what they do. " +
        "If the player is committing to LIVE something big (a match, an audition, a build, a " +
        "confession, a pitch, a first time), OFFER to play it out — choices like 'Play it out' vs " +
        "'Skip to how it lands' — and when they choose to play it out, emit " +
        "moment:{action:'enter', title, kind} and begin the scene in the present. " +
        "If a meaningful check is warranted, present it (stat + DC) and set awaiting_roll — then " +
        "stop, do not resolve it yourself.",
    );
  } else if (opts.mode === "sandbox" && opts.openingDream) {
    // Sandbox founding dream (A9): open the life already oriented around it.
    parts.push(
      `Open the game (SANDBOX / § WISHGRANTER). The player is 18 and their FOUNDING DREAM is: ` +
        `"${opts.openingDream}". Open the life already oriented around this want — ground them in ` +
        "a vivid present-tense moment at 18 with the dream alive and close enough to touch (name " +
        "the place, the time, one sensation). You already HAVE the dream (skip DECLARE): run the " +
        "wish loop on it — WARN the counteractive cost (~half, light), then offer take-it / " +
        "leave-it choices. If they take it, you'll next offer to play out the first MOMENT of " +
        "living it. Do not resolve it this turn.",
    );
  } else if (opts.mode === "sandbox") {
    parts.push(
      "Open the game (SANDBOX / § WISHGRANTER). The player is 18 — just out of the school " +
        "cage, the whole world in front of them. Cold-open somewhere that hums with " +
        "possibility (a rooftop over the city at dusk, the last day of something, a quiet " +
        "moment before everything). Ground it briefly, make them feel the door is wide open, " +
        "then invite them to name their first WANT in their own words — do NOT offer a menu " +
        "of dreams. End on the open question and let them speak it into the free-text box.",
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
