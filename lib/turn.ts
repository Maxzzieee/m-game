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
import { applyDelta, consumeOnFire } from "./state";
import { captureError } from "./log";
import { rollCheck } from "./dice";
import { db } from "./supabase";
import { ChoiceOption, DiceResult, Game } from "./types";

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

export async function setMeta(gameId: string, patch: GameMeta): Promise<void> {
  const { data } = await db().from("games").select("meta").eq("id", gameId).single();
  const meta = { ...(data?.meta ?? {}), ...patch };
  await db().from("games").update({ meta }).eq("id", gameId);
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
    const npcsForTags = await getActiveNpcs(game.id);
    await recordEvent(game, {
      role: "player",
      prose: mode.action.trim(),
      tags: deriveSearchTags(mode.action, npcsForTags),
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

  const [npcs, seeds, recent] = await Promise.all([
    getActiveNpcs(game.id),
    getPendingSeeds(game.id),
    getRecentEvents(game.id),
  ]);
  const [journal, pastCanon, pursuit] = await Promise.all([
    getArcJournal(game.id, game.arc),
    getPastCanon(game.id, game.arc),
    getActivePursuit(game.id),
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
  const updated = await applyDelta(game, delta);

  // Stash awaiting-roll + structured choices (both sanitized — model output is
  // never stored raw); clear consumed roll, world notes, and (on nudge) the hook.
  const awaitingRoll = sanitizeAwaitingRoll(delta.awaiting_roll);
  const newBeat = sanitizeBeat(delta.next_beat, updated.ingame_date);
  await setMeta(updated.id, {
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
    // Arc transition grants one +1 stat pick (rule: "adjust ONE stat at arc change").
    ...(delta.advance ? { pending_stat_boost: true } : {}),
  });

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
