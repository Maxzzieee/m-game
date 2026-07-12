import { db } from "./supabase";
import { ArcJournal, GameEvent, Npc, Pursuit, Seed } from "./types";

// How many of the most recent events stay verbatim in the prompt. Older ones get
// folded into the arc journal by the summariser. This keeps per-turn prompt size
// roughly constant no matter how long the playthrough runs.
export const KEEP_VERBATIM = 12;

export async function getRecentEvents(gameId: string, limit = KEEP_VERBATIM): Promise<GameEvent[]> {
  const { data, error } = await db()
    .from("events")
    .select("*")
    .eq("game_id", gameId)
    .order("turn_no", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getRecentEvents: ${error.message}`);
  return ((data as GameEvent[]) ?? []).reverse(); // chronological
}

export async function getActiveNpcs(gameId: string): Promise<Npc[]> {
  const { data, error } = await db()
    .from("npcs")
    .select("*")
    .eq("game_id", gameId)
    .neq("status", "dead")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getActiveNpcs: ${error.message}`);
  return (data as Npc[]) ?? [];
}

export async function getActivePursuit(gameId: string): Promise<Pursuit | null> {
  const { data } = await db()
    .from("pursuits")
    .select("*")
    .eq("game_id", gameId)
    .eq("status", "active")
    .maybeSingle();
  return (data as Pursuit) ?? null;
}

export async function getPendingSeeds(gameId: string): Promise<Seed[]> {
  const { data, error } = await db()
    .from("seeds")
    .select("*")
    .eq("game_id", gameId)
    .is("resolved_at_turn", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getPendingSeeds: ${error.message}`);
  return (data as Seed[]) ?? [];
}

// Canon facts of every CLOSED arc — the permanent truths of this life.
export async function getPastCanon(gameId: string, currentArc: number): Promise<string[]> {
  const { data } = await db()
    .from("arc_journal")
    .select("arc, canon")
    .eq("game_id", gameId)
    .lt("arc", currentArc)
    .not("canon", "is", null)
    .order("arc", { ascending: true });
  return ((data as Array<{ arc: number; canon: string }>) ?? []).map(
    (r) => `Arc ${r.arc}:\n${r.canon}`,
  );
}

export async function getArcJournal(gameId: string, arc: number): Promise<ArcJournal | null> {
  const { data } = await db()
    .from("arc_journal")
    .select("*")
    .eq("game_id", gameId)
    .eq("arc", arc)
    .maybeSingle();
  return (data as ArcJournal) ?? null;
}

// The "reputation echo" engine: surface older scenes (beyond the verbatim window)
// that share tags with what's happening now. Deterministic SQL, no embeddings.
export async function getRelevantMemories(
  gameId: string,
  tags: string[],
  beforeTurn: number,
  limit = 5,
): Promise<GameEvent[]> {
  if (tags.length === 0) return [];
  const { data, error } = await db()
    .from("events")
    .select("*")
    .eq("game_id", gameId)
    .lt("turn_no", beforeTurn - KEEP_VERBATIM) // only OLD stuff, not the verbatim window
    .overlaps("tags", tags)
    .order("turn_no", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getRelevantMemories: ${error.message}`);
  return ((data as GameEvent[]) ?? []).reverse();
}

// Cheap tag derivation for retrieval: NPC names mentioned in the player's action,
// plus a small set of theme keywords. The DM's own richer tags are added to
// events after the fact; this is just to seed the search for the upcoming turn.
const THEME_KEYWORDS: Record<string, string[]> = {
  fight: ["punch", "fight", "hit", "beat", "confront"],
  crush: ["crush", "love", "date", "kiss", "confess"],
  exam: ["exam", "test", "paper", "study", "mug", "o level", "n level", "a level"],
  money: ["money", "cash", "broke", "pay", "loan", "owe"],
  family: ["mum", "mom", "dad", "father", "mother", "ah ma", "ah gong", "parents"],
  ns: ["ns", "tekong", "encik", "ippt", "camp", "book out", "book in"],
  cca: ["cca", "band", "captain", "training", "competition"],
};

export function deriveSearchTags(input: string, npcs: Npc[]): string[] {
  const lower = input.toLowerCase();
  const tags = new Set<string>();
  for (const npc of npcs) {
    if (lower.includes(npc.name.toLowerCase())) tags.add(npc.name);
  }
  for (const [theme, kws] of Object.entries(THEME_KEYWORDS)) {
    if (kws.some((k) => lower.includes(k))) tags.add(theme);
  }
  // always allow echoes involving anyone currently around
  for (const npc of npcs) tags.add(npc.name);
  return [...tags];
}
