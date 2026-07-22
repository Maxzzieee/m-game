import { runDmTurn } from "./agents/dm";
import { closeArcCanon, maybeSummarize } from "./agents/summarizer";
import { maybeKarmaCashIn } from "./game";
import {
  buildMemoriesBlock,
  buildRecentBlock,
  buildStateBlock,
  buildUserMessage,
} from "./prompt";
import {
  deriveSearchTags,
  getActiveNpcs,
  getActivePursuit,
  getArcJournal,
  getPastCanon,
  getPendingSeeds,
  getRecentEvents,
  getRelevantMemories,
} from "./memory";
import { getFlows, getGoals } from "./money";
import { applyDelta, consumeOnFire } from "./state";
import { accrueIncome, applyFlowOps, applyGoalOps } from "./money";
import { captureError } from "./log";
import { rollCheck } from "./dice";
import { db } from "./supabase";
import type { ChoiceOption, DiceResult, Game, Moment, Scene } from "./types";

export interface AwaitingRoll {
  stat: string;
  dc: number;
  reason: string;
  mode?: "normal" | "advantage" | "disadvantage";
  mode_reason?: string; // why circumstances grant it, shown to the player
}

interface GameMeta {
  awaiting_roll?: AwaitingRoll | null;
  last_roll?: DiceResult | null;
  world_notes?: string[] | null;
  pending_stat_boost?: boolean;
  choices?: ChoiceOption[] | null;
  scene_hook?: string | null;
  next_beat?: { label: string; date: string } | null;
  scene?: Scene | null; // where/when we are now (for the scene header)
  moment?: Moment | null; // the active zoomed-in set-piece, or null on the life layer
  opening_dream?: string | null; // sandbox: the founding dream the life flows from
  date_anchor_turn?: number; // turn_no when ingame_date last advanced (frozen-clock guard)
}

export function getMeta(game: Game): GameMeta {
  return (game.meta as GameMeta) ?? {};
}

// ---- tool-output sanitizers -------------------------------------------------
// The DM's record_turn input is model-generated; never store it unvalidated.
// (A string in meta.choices once white-screened production: strings have
// .length, so the client skipped its fallback and called .map on it.)

function sanitizeChoices(raw: unknown): ChoiceOption[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ChoiceOption[] = [];
  for (const c of raw) {
    if (
      c &&
      typeof c === "object" &&
      typeof (c as ChoiceOption).key === "string" &&
      typeof (c as ChoiceOption).label === "string" &&
      (c as ChoiceOption).label.trim()
    ) {
      out.push({ key: (c as ChoiceOption).key.slice(0, 2), label: (c as ChoiceOption).label });
    }
    if (out.length >= 4) break;
  }
  // A lone option isn't a menu — the free-text box already covers "do anything".
  // (Dropping it silently is intentional; the UI falls back to open input.)
  return out.length >= 2 ? out : null;
}

function sanitizeBeat(
  raw: unknown,
  currentDate: string,
): { label: string; date: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.label !== "string" || !b.label.trim()) return null;
  if (typeof b.date !== "string" || !/^\d{4}-\d{2}$/.test(b.date)) return null;
  if (b.date < currentDate) return null;
  return { label: b.label.trim().slice(0, 80), date: b.date };
}

function sanitizeScene(raw: unknown): Scene | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const location = typeof s.location === "string" ? s.location.trim().slice(0, 80) : "";
  const time = typeof s.time_of_day === "string" ? s.time_of_day.trim().slice(0, 60) : "";
  if (!location && !time) return null;
  return { location, time_of_day: time };
}

// Returns the state patch the DM's `moment` op implies, or undefined if none.
// enter → activate a Moment; resolve → clear it (zoom back out).
function sanitizeMomentPatch(raw: unknown): { moment: Moment | null } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const m = raw as Record<string, unknown>;
  if (m.action === "resolve") return { moment: null };
  if (m.action === "enter") {
    const title = typeof m.title === "string" && m.title.trim() ? m.title.trim().slice(0, 80) : "The moment";
    const kind = typeof m.kind === "string" && m.kind.trim() ? m.kind.trim().slice(0, 24) : "scene";
    return { moment: { title, kind, active: true } };
  }
  return undefined;
}

function sanitizeAwaitingRoll(raw: unknown): AwaitingRoll | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.stat !== "string" || typeof r.dc !== "number" || typeof r.reason !== "string") {
    return null;
  }
  const mode =
    r.mode === "advantage" || r.mode === "disadvantage" ? r.mode : ("normal" as const);
  return {
    stat: r.stat,
    dc: Math.max(1, Math.min(30, Math.round(r.dc))),
    reason: r.reason,
    mode,
    mode_reason: typeof r.mode_reason === "string" ? r.mode_reason : undefined,
  };
}

// Returns the merged meta so callers can keep their in-memory game object in
// sync — critical for the inline-state payload, which must reflect THIS turn's
// choices/awaiting_roll, not the stale copy applyDelta re-selected beforehand.
export async function setMeta(gameId: string, patch: GameMeta): Promise<GameMeta> {
  const { data } = await db().from("games").select("meta").eq("id", gameId).single();
  const meta = { ...(data?.meta ?? {}), ...patch };
  await db().from("games").update({ meta }).eq("id", gameId);
  return meta;
}

// Insert one event, advancing the per-event sequence (games.turn_no).
async function recordEvent(
  game: Game,
  ev: {
    role: "dm" | "player";
    prose: string;
    summary?: string | null;
    dice?: DiceResult | null;
    tags?: string[];
  },
): Promise<number> {
  // Atomic sequence: the DB increments and returns in one statement. (This used
  // to be read-modify-write in JS, which two concurrent writers could collide on
  // and overwrite an event.) Falls back to the old path if migration 007 hasn't
  // been applied yet.
  let seq: number;
  const { data: rpc, error: rpcErr } = await db().rpc("next_turn", { p_game_id: game.id });
  if (!rpcErr && typeof rpc === "number") {
    seq = rpc;
  } else {
    seq = game.turn_no + 1;
    await db().from("games").update({ turn_no: seq }).eq("id", game.id);
  }

  await db().from("events").insert({
    game_id: game.id,
    turn_no: seq,
    arc: game.arc,
    role: ev.role,
    prose: ev.prose,
    summary: ev.summary ?? null,
    dice: ev.dice ?? null,
    tags: ev.tags ?? [],
  });
  game.turn_no = seq; // keep local copy in sync
  return seq;
}

// Resolve the pending check server-side: roll the die, record it, consume any
// [On Fire] charge, and stash the result for the DM's consequence turn. Returns
// the DiceResult for the client to animate. This is what enforces "the DM never
// rolls for the player" — the die lives here, not in the model.
export async function resolvePendingRoll(
  game: Game,
  manual?: number[],
): Promise<DiceResult | null> {
  const meta = getMeta(game);
  const pending = meta.awaiting_roll;
  if (!pending) return null;

  const dice = rollCheck(game, pending.stat, pending.dc, pending.mode ?? "normal", manual);
  if (manual?.length) dice.manual = true;
  await recordEvent(game, {
    role: "player",
    prose: `(rolled for: ${pending.reason})`,
    dice,
    tags: [],
  });
  await consumeOnFire(game);
  await setMeta(game.id, { awaiting_roll: null, last_roll: dice });
  return dice;
}

type Mode =
  | { kind: "start" }
  | { kind: "action"; action: string }
  | { kind: "resolve"; dice: DiceResult }
  | { kind: "nudge" } // NPC-initiated scene: the world moves first
  | { kind: "montage"; span: "weeks" | "months" | "beat"; focus?: string }; // pass time

// Story life-stage → arc number (mirrors the pacing guard in prompt.ts).
function arcForAge(a: number): number {
  return a <= 16 ? 1 : a <= 18 ? 2 : a <= 20 ? 3 : a <= 25 ? 4 : 5;
}
const ARC_NAMES: Record<number, string> = {
  1: "The Orientation",
  2: "The Crossroads",
  3: "The Tekong Years",
  4: "The Working World",
  5: "The Long Game",
};
// Girls aren't conscripted, so their Arc 3 isn't NS.
function arcName(arc: number, gender?: string): string {
  if (arc === 3 && gender === "girl") return "The Wider World";
  return ARC_NAMES[arc] ?? `Arc ${arc}`;
}

// Mechanical pacing backstop. A prompt nudge asks the DM to move time; this makes
// the app DO it. When a life is running FAR behind its scene budget (many scenes
// played, barely any time passed), advance the clock/age/arc in code and hand the
// DM a montage instruction it can't ignore. Returns the jump note, or null.
async function maybeForcePacing(game: Game): Promise<string | null> {
  const meta = getMeta(game);
  if (meta.moment?.active) return null; // never yank someone out of a lived Moment
  const scenes = Math.floor(game.turn_no / 2.5);
  const startAge = game.mode === "sandbox" ? 18 : 13;
  const expectedAge = startAge + Math.floor(scenes / 14); // a school year ≈ 8-12 scenes
  if (expectedAge - game.age < 3) return null; // mild lag is the prompt guard's job

  const newAge = Math.min(expectedAge, game.age + 6); // decisive, but not absurd
  const years = newAge - game.age;
  if (years <= 0) return null;
  const [y, m] = game.ingame_date.split("-");
  const newDate = `${Number(y) + years}-${m ?? "01"}`;
  const oldArc = game.arc;
  const newArc = arcForAge(newAge);

  const gender = (game.meta as { gender?: string })?.gender;
  const patch: Record<string, unknown> = { age: newAge, ingame_date: newDate };
  if (newArc > oldArc) {
    patch.arc = newArc;
    patch.arc_name = arcName(newArc, gender);
    patch.heng = Math.min(3, (game.heng ?? 2) + 1); // arc-up reward, as normal
  }
  await db().from("games").update(patch).eq("id", game.id);
  Object.assign(game, patch);

  const metaPatch: GameMeta = { date_anchor_turn: game.turn_no };
  if (newArc > oldArc) {
    metaPatch.pending_stat_boost = true; // arc-up grants a +1 stat pick, as normal
    try {
      await closeArcCanon(game, oldArc); // distill the arc we're leaving into canon
    } catch {
      /* best-effort */
    }
  }
  game.meta = (await setMeta(game.id, metaPatch)) as Record<string, unknown>;

  return (
    `TIME HAS JUMPED — the app advanced the clock because the life was far behind pace. ` +
    `It is now ${newDate}; the character is AGE ${newAge}` +
    (newArc > oldArc ? `, now in Arc ${newArc} — ${patch.arc_name}` : "") +
    `. Narrate the leap: briefly nod to the player's last action, then MONTAGE the intervening ` +
    `${years === 1 ? "year" : `${years} years`} in 2-4 vivid sentences (how the school stage, ` +
    `friendships, the body and the family changed), then open a fresh present-tense scene in ` +
    `this new period with choices. Do NOT emit \`advance\` (already done); do NOT keep the ` +
    `character at the old age.`
  );
}

// Orchestrate one story turn: assemble DB-owned context, run the DM (streaming
// prose via onText), persist the event + apply the structured delta, and fold
// old scenes into the journal. Returns the refreshed game.
export async function runStoryTurn(
  game: Game,
  mode: Mode,
  opts: {
    onText?: (c: string) => void;
    onToolStart?: () => void;
  } = {},
): Promise<{ game: Game }> {
  // Record the player's action first (so it's in the recent window if the DM
  // retrieves it). Roll events are recorded by the roll route already.
  if (mode.kind === "action" && mode.action.trim()) {
    const action = mode.action.trim();
    // Idempotency: if the last event is the identical player action, this is a
    // double-submit (fast double-tap, a retry, a second tab). Don't record it
    // again — otherwise the DM sees it twice and narrates "you already said that".
    const { data: last } = await db()
      .from("events")
      .select("role, prose")
      .eq("game_id", game.id)
      .order("turn_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last?.role === "player" && (last.prose as string)?.trim() === action) {
      return { game }; // silently no-op the duplicate turn
    }
    const npcsForTags = await getActiveNpcs(game.id);
    await recordEvent(game, {
      role: "player",
      prose: action,
      tags: deriveSearchTags(action, npcsForTags),
    });
  } else if (mode.kind === "montage") {
    const spanLabel =
      mode.span === "beat" ? "until the next beat" : mode.span === "months" ? "a few months" : "a few weeks";
    await recordEvent(game, {
      role: "player",
      prose: `⏩ passes time (${spanLabel}${mode.focus ? ` — ${mode.focus}` : ""})`,
      tags: ["montage"],
    });
  }

  // Mechanical pacing backstop: if the life is far behind its scene budget, the
  // app advances the clock/age/arc HERE (before context is gathered, so the new
  // arc's journal/canon is loaded) and hands the DM an un-ignorable montage note.
  const pacingJump = mode.kind === "action" || mode.kind === "start" ? await maybeForcePacing(game) : null;

  const [npcs, seeds, recent] = await Promise.all([
    getActiveNpcs(game.id),
    getPendingSeeds(game.id),
    getRecentEvents(game.id),
  ]);
  const [journal, pastCanon, pursuit, flows, goals] = await Promise.all([
    getArcJournal(game.id, game.arc),
    getPastCanon(game.id, game.arc),
    getActivePursuit(game.id),
    getFlows(game.id),
    getGoals(game.id),
  ]);
  const karmaCashIn = await maybeKarmaCashIn(game);
  const meta = getMeta(game);
  const worldNotes = meta.world_notes ?? [];
  const sceneHook = mode.kind === "nudge" ? (meta.scene_hook ?? null) : null;

  // Reputation-echo retrieval: what old scenes are relevant right now?
  const searchSeed =
    mode.kind === "action" ? mode.action : mode.kind === "resolve" ? mode.dice.stat : "";
  const tags = deriveSearchTags(searchSeed, npcs);
  const memories = await getRelevantMemories(game.id, tags, game.turn_no);

  // Who's actually on screen now: NPCs named in the last few scenes or in the
  // player's action. These stay in full detail; the rest collapse to names.
  const focusText = (
    recent.slice(-4).map((e) => e.prose).join(" ") +
    " " +
    (mode.kind === "action" ? mode.action : "")
  ).toLowerCase();
  const focusNpcNames = npcs
    .filter((n) => focusText.includes(n.name.toLowerCase()))
    .map((n) => n.name);

  const stateBlock = buildStateBlock(
    game,
    npcs,
    seeds,
    journal,
    karmaCashIn,
    worldNotes,
    pastCanon,
    pursuit,
    sceneHook,
    meta.next_beat ?? null,
    // The menu the player just answered — the DM must not re-offer it.
    mode.kind === "action" ? (meta.choices ?? []) : [],
    flows,
    goals,
    focusNpcNames,
  );
  const memoriesBlock = buildMemoriesBlock(memories);
  const recentBlock = buildRecentBlock(recent);

  const userMessage = buildUserMessage({
    stateBlock,
    memoriesBlock,
    recentBlock,
    playerAction: mode.kind === "action" ? mode.action : "",
    diceResult: mode.kind === "resolve" ? mode.dice : null,
    nudge: mode.kind === "nudge",
    montage: mode.kind === "montage" ? { span: mode.span, focus: mode.focus } : null,
    mode: game.mode,
    activeMoment: meta.moment?.active ? meta.moment : null,
    openingDream: game.mode === "sandbox" ? (meta.opening_dream ?? null) : null,
    pacingJump,
  });

  const { text, delta } = await runDmTurn(userMessage, {
    onText: opts.onText,
    onToolStart: opts.onToolStart,
  });

  // Persist the DM scene.
  await recordEvent(game, {
    role: "dm",
    prose: text,
    summary: delta.summary,
    tags: delta.tags ?? [],
  });

  // Apply the structured delta to the authoritative ledger.
  const closingArc = game.arc;
  const oldDate = game.ingame_date;
  const updated = await applyDelta(game, delta);

  // Money system: apply recurring-flow ops first (so a job started "this
  // montage" counts), accrue net income for the months elapsed, then apply
  // goal ops (contributions draw from the freshly-accrued balance).
  if (delta.ledger?.length) await applyFlowOps(updated.id, updated.arc, delta.ledger);
  updated.money = await accrueIncome(updated.id, oldDate, updated.ingame_date, updated.money);
  if (delta.money_goals?.length)
    updated.money = await applyGoalOps(updated.id, updated.money, delta.money_goals);

  // Stash awaiting-roll + structured choices (both sanitized — model output is
  // never stored raw); clear consumed roll, world notes, and (on nudge) the hook.
  // Sandbox (Wishgranter) has no dice: strip any roll the model emits so a
  // pending-check prompt can never surface, whatever the DM tries.
  const awaitingRoll =
    game.mode === "sandbox" ? null : sanitizeAwaitingRoll(delta.awaiting_roll);
  const newBeat = sanitizeBeat(delta.next_beat, updated.ingame_date);
  const newScene = sanitizeScene(delta.scene);
  const momentPatch = sanitizeMomentPatch(delta.moment); // enter/resolve, or undefined
  // Assign the merged meta back onto `updated` — applyDelta re-selected the row
  // BEFORE this write, so without this the inline payload would ship the
  // previous turn's choices alongside this turn's prose.
  updated.meta = await setMeta(updated.id, {
    awaiting_roll: awaitingRoll,
    choices: awaitingRoll ? null : sanitizeChoices(delta.choices),
    last_roll: null,
    world_notes: null,
    // Beats persist until replaced; a stale beat (date now in the past) is dropped.
    ...(newBeat
      ? { next_beat: newBeat }
      : meta.next_beat && meta.next_beat.date < updated.ingame_date
        ? { next_beat: null }
        : {}),
    ...(mode.kind === "nudge" ? { scene_hook: null } : {}),
    // Scene header updates when the place/time moves; a Moment enter/resolve
    // flips the zoom state (undefined patch = leave the current Moment as-is).
    ...(newScene ? { scene: newScene } : {}),
    ...(momentPatch ?? {}),
    // Frozen-clock guard: remember the turn the date last moved, so a stalled
    // clock can be detected and forced forward (see buildStateBlock).
    ...(updated.ingame_date !== oldDate ? { date_anchor_turn: updated.turn_no } : {}),
    // Once the sandbox founding dream has opened the life, don't re-trigger it.
    ...(mode.kind === "start" && game.mode === "sandbox" ? { opening_dream: null } : {}),
    // Arc transition grants one +1 stat pick (rule: "adjust ONE stat at arc change").
    ...(delta.advance ? { pending_stat_boost: true } : {}),
  }) as Record<string, unknown>;

  // Bookkeeping past this point is best-effort: the scene is already saved, so
  // a summariser hiccup must never surface as "the DM stumbled" on a turn that
  // actually succeeded.
  try {
    // Fold old scenes into the journal if we've grown past the verbatim window.
    await maybeSummarize(updated);
  } catch (err) {
    await captureError("agent/summarizer", err, { game_id: updated.id, arc: updated.arc });
  }

  // On arc transition, compress the closed arc's journal into canon facts.
  if (delta.advance) {
    try {
      await closeArcCanon(updated, closingArc);
    } catch (err) {
      await captureError("agent/canon", err, { game_id: updated.id, arc: closingArc });
    }
  }

  return { game: updated };
}
