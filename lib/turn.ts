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
}

export function getMeta(game: Game): GameMeta {
  return (game.meta as GameMeta) ?? {};
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
  const seq = game.turn_no + 1;
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
  await db().from("games").update({ turn_no: seq }).eq("id", game.id);
  game.turn_no = seq; // keep local copy in sync
  return seq;
}

// Resolve the pending check server-side: roll the die, record it, consume any
// [On Fire] charge, and stash the result for the DM's consequence turn. Returns
// the DiceResult for the client to animate. This is what enforces "the DM never
// rolls for the player" — the die lives here, not in the model.
export async function resolvePendingRoll(game: Game): Promise<DiceResult | null> {
  const meta = getMeta(game);
  const pending = meta.awaiting_roll;
  if (!pending) return null;

  const dice = rollCheck(game, pending.stat, pending.dc, pending.mode ?? "normal");
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
  | { kind: "nudge" }; // NPC-initiated scene: the world moves first

// Orchestrate one story turn: assemble DB-owned context, run the DM (streaming
// prose via onText), persist the event + apply the structured delta, and fold
// old scenes into the journal. Returns the refreshed game.
export async function runStoryTurn(
  game: Game,
  mode: Mode,
  opts: { big?: boolean; onText?: (c: string) => void } = {},
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
  });

  // Karma cash-ins are pivotal scenes — route them to the big model.
  const useBig = opts.big || karmaCashIn !== null;

  const { text, delta } = await runDmTurn(userMessage, { useBig, onText: opts.onText });

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

  // Stash awaiting-roll + structured choices; clear consumed roll, world notes,
  // and (on nudge) the scene hook.
  await setMeta(updated.id, {
    awaiting_roll: delta.awaiting_roll ?? null,
    choices: delta.awaiting_roll ? null : (delta.choices ?? null),
    last_roll: null,
    world_notes: null,
    ...(mode.kind === "nudge" ? { scene_hook: null } : {}),
    // Arc transition grants one +1 stat pick (rule: "adjust ONE stat at arc change").
    ...(delta.advance ? { pending_stat_boost: true } : {}),
  });

  // Fold old scenes into the journal if we've grown past the verbatim window.
  await maybeSummarize(updated);

  // On arc transition, compress the closed arc's journal into canon facts.
  if (delta.advance) {
    try {
      await closeArcCanon(updated, closingArc);
    } catch {
      // canon compression failing must never block play
    }
  }

  return { game: updated };
}
