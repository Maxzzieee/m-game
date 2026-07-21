import { anthropic, MODELS } from "../anthropic";
import { db } from "../supabase";
import { KEEP_VERBATIM } from "../memory";
import type { ArcJournal, Game, GameEvent } from "../types";

// Fold older verbatim events into the arc journal so the prompt stays bounded.
// Runs only when there are events past the verbatim window that haven't been
// folded yet. Cheap Haiku pass.
export async function maybeSummarize(game: Game): Promise<void> {
  const cutoff = game.turn_no - KEEP_VERBATIM;
  if (cutoff <= 0) return;

  const { data: rows } = await db()
    .from("events")
    .select("*")
    .eq("game_id", game.id)
    .eq("arc", game.arc)
    .eq("summarized", false)
    .lte("turn_no", cutoff)
    .order("turn_no", { ascending: true });

  const events = (rows as GameEvent[]) ?? [];
  if (events.length === 0) return;

  const { data: jrow } = await db()
    .from("arc_journal")
    .select("*")
    .eq("game_id", game.id)
    .eq("arc", game.arc)
    .maybeSingle();
  const journal = jrow as ArcJournal | null;

  const transcript = events
    .map((e) => {
      const who = e.role === "player" ? "PLAYER" : "DM";
      const dice = e.dice ? ` [rolled d20 ${e.dice.d20} → ${e.dice.outcome}]` : "";
      return `${who}${dice}: ${e.summary ?? e.prose}`;
    })
    .join("\n");

  const prompt = [
    "You maintain a running journal for a Singapore life-sim RPG. Fold the NEW scenes",
    "into the EXISTING journal, producing an updated journal that keeps every LOAD-BEARING",
    "fact: names, relationships, decisions, promises, grudges, reputation shifts, and",
    "emotional turning points.",
    "HARD LIMIT: the whole journal must stay under ~200 words (about 12 sentences). When",
    "folding would push it over, COMPRESS: drop stale minutiae and one-off small talk that no",
    "longer matters, merge related facts, and keep only what still shapes the character's",
    "life. A tight journal beats a complete one — superseded detail should be forgotten.",
    "Do not invent anything. Output ONLY the updated journal text.",
    "",
    `EXISTING JOURNAL (arc ${game.arc}):`,
    journal?.body || "(empty)",
    "",
    "NEW SCENES:",
    transcript,
  ].join("\n");

  const resp = await anthropic().messages.create({
    model: MODELS.summarizer,
    max_tokens: 900,
    messages: [{ role: "user", content: prompt }],
  });

  const body = resp.content.find((b) => b.type === "text")?.text?.trim() || journal?.body || "";
  const lastTurn = events[events.length - 1].turn_no;

  if (journal) {
    await db()
      .from("arc_journal")
      .update({ body, last_turn_folded: lastTurn, updated_at: new Date().toISOString() })
      .eq("id", journal.id);
  } else {
    await db().from("arc_journal").insert({
      game_id: game.id,
      arc: game.arc,
      body,
      last_turn_folded: lastTurn,
    });
  }

  const ids = events.map((e) => e.id);
  await db().from("events").update({ summarized: true }).in("id", ids);
}

// When an arc closes, distill its whole journal into a handful of permanent
// "canon facts" — the load-bearing truths later arcs must never contradict.
export async function closeArcCanon(game: Game, closedArc: number): Promise<void> {
  const { data: jrow } = await db()
    .from("arc_journal")
    .select("*")
    .eq("game_id", game.id)
    .eq("arc", closedArc)
    .maybeSingle();
  const journal = jrow as ArcJournal | null;
  if (!journal?.body || journal.canon) return;

  const resp = await anthropic().messages.create({
    model: MODELS.summarizer,
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: [
          `An arc of a life-sim has closed. Distill this journal into 4-6 permanent canon facts —`,
          `the truths the rest of the character's life must never contradict: relationships won or`,
          `broken, reputations earned, promises made, wounds taken. Terse bullet lines, no prose.`,
          "",
          journal.body,
        ].join("\n"),
      },
    ],
  });

  const canon = resp.content.find((b) => b.type === "text")?.text?.trim();
  if (canon) {
    await db().from("arc_journal").update({ canon }).eq("id", journal.id);
  }
}
