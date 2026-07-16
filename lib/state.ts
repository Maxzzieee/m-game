import { db } from "./supabase";
import type { Game, TurnDelta } from "./types";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Apply a DM-emitted TurnDelta to the authoritative DB. Numeric fields are
// deltas; stats clamp to -1..+5, reputation to -5..+5. Returns the fresh game.
export async function applyDelta(game: Game, delta: TurnDelta): Promise<Game> {
  const patch: Partial<Game> = {};

  // stats (deltas, clamp -1..5)
  if (delta.stats) {
    for (const k of ["brains", "face", "brawn", "guts"] as const) {
      const d = delta.stats[k];
      if (typeof d === "number") patch[k] = clamp((game[k] as number) + d, -1, 5);
    }
  }

  // reputation (deltas, clamp -5..5) — delta keys are short; columns are rep_*
  if (delta.reputation) {
    const map = {
      academic: "rep_academic",
      social: "rep_social",
      street: "rep_street",
      family: "rep_family",
      system: "rep_system",
    } as const;
    for (const short of Object.keys(map) as Array<keyof typeof map>) {
      const d = delta.reputation[short];
      if (typeof d === "number") {
        const col = map[short];
        (patch as Record<string, number>)[col] = clamp((game[col] as number) + d, -5, 5);
      }
    }
  }

  // karma (hidden delta, uncapped)
  if (typeof delta.karma === "number") patch.karma = game.karma + delta.karma;

  // money (SGD delta; may go negative — debt is thematic)
  if (typeof delta.money === "number") patch.money = game.money + delta.money;

  // in-game time (absolute YYYY-MM, monotonic — never travel backwards)
  if (typeof delta.ingame_date === "string" && /^\d{4}-\d{2}$/.test(delta.ingame_date)) {
    if (delta.ingame_date >= game.ingame_date) patch.ingame_date = delta.ingame_date;
  }

  // mental state (absolute); arm On Fire counter
  if (delta.mental_state && delta.mental_state !== game.mental_state) {
    patch.mental_state = delta.mental_state;
    patch.on_fire_checks = delta.mental_state === "On Fire" ? 3 : 0;
  }

  // confirm plus chop spent
  if (delta.confirm_chop_used) patch.confirm_chop = false;

  // arc advance — refresh confirm chop and bank a heng token for the new arc
  if (delta.advance) {
    patch.arc = delta.advance.arc;
    patch.arc_name = delta.advance.arc_name;
    patch.age = delta.advance.age;
    patch.confirm_chop = true;
    patch.heng = Math.min(3, (game.heng ?? 0) + 1);
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await db().from("games").update(patch).eq("id", game.id);
    if (error) throw new Error(`applyDelta games update: ${error.message}`);
  }

  // NPC changes
  if (delta.npc_changes?.length) {
    for (const nc of delta.npc_changes) {
      const { data: existing } = await db()
        .from("npcs")
        .select("*")
        .eq("game_id", game.id)
        .ilike("name", nc.name)
        .maybeSingle();

      if (existing) {
        const upd: Record<string, unknown> = {};
        if (typeof nc.relationship === "number")
          upd.relationship = clamp(existing.relationship + nc.relationship, -5, 5);
        if (nc.status) upd.status = nc.status;
        if (nc.hidden_motivation) upd.hidden_motivation = nc.hidden_motivation;
        if (Object.keys(upd).length)
          await db().from("npcs").update(upd).eq("id", existing.id);
      } else {
        await db().from("npcs").insert({
          game_id: game.id,
          name: nc.name,
          archetype: nc.archetype || "minor",
          hook: nc.hook || "",
          hidden_motivation: nc.hidden_motivation || null,
          relationship: typeof nc.relationship === "number" ? clamp(nc.relationship, -5, 5) : 0,
          status: nc.status || "active",
          first_arc: game.arc,
        });
      }
    }
  }

  // pursuit (the Dreams engine): declare creates/replaces the active pursuit;
  // stage/status/milestone updates mutate it.
  if (delta.pursuit) {
    const p = delta.pursuit;
    const { data: active } = await db()
      .from("pursuits")
      .select("*")
      .eq("game_id", game.id)
      .eq("status", "active")
      .maybeSingle();

    if (p.declare) {
      // A new dream supersedes the old active one (it becomes abandoned unless
      // the DM explicitly marked it transformed this same turn).
      if (active) {
        await db()
          .from("pursuits")
          .update({ status: p.status === "transformed" ? "transformed" : "abandoned" })
          .eq("id", active.id);
      }
      await db().from("pursuits").insert({
        game_id: game.id,
        dream: p.declare,
        stage: clamp(p.stage ?? 0, 0, 6),
        status: "active",
        next_milestone: p.next_milestone ?? null,
        note: p.note ?? null,
      });
    } else if (active) {
      const upd: Record<string, unknown> = {};
      if (typeof p.stage === "number") upd.stage = clamp(p.stage, 0, 6);
      if (p.status) upd.status = p.status;
      if (p.next_milestone) upd.next_milestone = p.next_milestone;
      if (p.note) upd.note = p.note;
      if (Object.keys(upd).length) await db().from("pursuits").update(upd).eq("id", active.id);
    }
  }

  // new seed
  if (delta.new_seed) {
    await db().from("seeds").insert({
      game_id: game.id,
      description: delta.new_seed,
      arc_created: game.arc,
      tags: delta.tags ?? [],
    });
  }

  const { data: fresh, error } = await db()
    .from("games")
    .select("*")
    .eq("id", game.id)
    .single();
  if (error || !fresh) throw new Error(`applyDelta reload: ${error?.message}`);
  return fresh as Game;
}

// Decrement the On Fire counter after a check resolves; revert to Fresh at 0.
export async function consumeOnFire(game: Game): Promise<void> {
  if (game.mental_state !== "On Fire") return;
  const left = game.on_fire_checks - 1;
  await db()
    .from("games")
    .update(
      left <= 0
        ? { on_fire_checks: 0, mental_state: "Fresh" }
        : { on_fire_checks: left },
    )
    .eq("id", game.id);
}

export async function bumpTurn(game: Game): Promise<number> {
  const next = game.turn_no + 1;
  await db().from("games").update({ turn_no: next }).eq("id", game.id);
  return next;
}
