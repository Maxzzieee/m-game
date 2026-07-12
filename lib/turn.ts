import { runDmTurn } from "./agents/dm";
import { maybeSummarize } from "./agents/summarizer";
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
  getArcJournal,
  getPendingSeeds,
  getRecentEvents,
  getRelevantMemories,
} from "./memory";
import { applyDelta, consumeOnFire } from "./state";
import { rollCheck } from "./dice";
import { db } from "./supabase";
import { DiceResult, Game } from "./types";

export interface AwaitingRoll {
  stat: string;
  dc: number;
  reason: string;
}

interface GameMeta {
  awaiting_roll?: AwaitingRoll | null;
  last_roll?: DiceResult | null;
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

  const dice = rollCheck(game, pending.stat, pending.dc);
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
  | { kind: "resolve"; dice: DiceResult };

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
  const journal = await getArcJournal(game.id, game.arc);
  const karmaCashIn = await maybeKarmaCashIn(game);

  // Reputation-echo retrieval: what old scenes are relevant right now?
  const searchSeed =
    mode.kind === "action" ? mode.action : mode.kind === "resolve" ? mode.dice.stat : "";
  const tags = deriveSearchTags(searchSeed, npcs);
  const memories = await getRelevantMemories(game.id, tags, game.turn_no);

  const stateBlock = buildStateBlock(game, npcs, seeds, journal, karmaCashIn);
  const memoriesBlock = buildMemoriesBlock(memories);
  const recentBlock = buildRecentBlock(recent);

  const userMessage = buildUserMessage({
    stateBlock,
    memoriesBlock,
    recentBlock,
    playerAction: mode.kind === "action" ? mode.action : "",
    diceResult: mode.kind === "resolve" ? mode.dice : null,
  });

  const { text, delta } = await runDmTurn(userMessage, { useBig: opts.big, onText: opts.onText });

  // Persist the DM scene.
  await recordEvent(game, {
    role: "dm",
    prose: text,
    summary: delta.summary,
    tags: delta.tags ?? [],
  });

  // Apply the structured delta to the authoritative ledger.
  const updated = await applyDelta(game, delta);

  // Stash any awaiting-roll for the roll endpoint; clear a consumed roll.
  await setMeta(updated.id, {
    awaiting_roll: delta.awaiting_roll ?? null,
    last_roll: null,
  });

  // Fold old scenes into the journal if we've grown past the verbatim window.
  await maybeSummarize(updated);

  return { game: updated };
}
