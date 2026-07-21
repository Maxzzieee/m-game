import crypto from "node:crypto";
import { db } from "./supabase";
import { STEREOTYPES, looksTier, sesTier } from "./constants";
import type { Game, GameMode, Stereotype } from "./types";

export { STEREOTYPES, looksTier, sesTier };

export async function createGame(input: {
  profile: string;
  char_name: string;
  label: string; // preset name or custom archetype label
  flavour: string;
  stats: { brains: number; face: number; brawn: number; guts: number };
  ses_roll: number;
  looks_roll: number;
  mode?: GameMode; // defaults to the dice/adversity RPG
  dream?: string; // sandbox: the founding dream the life flows from
}): Promise<Game> {
  const { data, error } = await db()
    .from("games")
    .insert({
      profile: input.profile,
      mode: input.mode ?? "story",
      // Sandbox (Wishgranter) begins at 18 — out of school, world wide open.
      // Story keeps the schema defaults (13, Arc 1, Sec 1 orientation).
      ...(input.mode === "sandbox"
        ? { age: 18, arc: 2, arc_name: "The Open Door", ingame_date: "2021-01" }
        : {}),
      char_name: input.char_name,
      stereotype: input.label,
      ses_roll: input.ses_roll,
      ses_tier: sesTier(input.ses_roll),
      looks_roll: input.looks_roll,
      looks_tier: looksTier(input.looks_roll),
      brains: input.stats.brains,
      face: input.stats.face,
      brawn: input.stats.brawn,
      guts: input.stats.guts,
      meta: {
        flavour: input.flavour,
        ...(input.mode === "sandbox" && input.dream?.trim()
          ? { opening_dream: input.dream.trim().slice(0, 200) }
          : {}),
      },
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`createGame: ${error?.message}`);
  return data as Game;
}

export async function getGame(id: string): Promise<Game | null> {
  const { data } = await db().from("games").select("*").eq("id", id).maybeSingle();
  return (data as Game) ?? null;
}

export async function latestGame(profile: string): Promise<Game | null> {
  const { data } = await db()
    .from("games")
    .select("*")
    .eq("profile", profile)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Game) ?? null;
}

// Decide whether a hidden karma cash-in should land this turn. Banks quietly; at
// |karma| >= 5 there's a ~30% chance per turn to pay off, and the payoff bleeds
// the counter back toward zero. Returns the direction (narrated as coincidence).
export async function maybeKarmaCashIn(game: Game): Promise<"good" | "bad" | null> {
  if (Math.abs(game.karma) < 5) return null;
  if (crypto.randomInt(100) >= 30) return null;
  const dir = game.karma > 0 ? "good" : "bad";
  const bleed = game.karma > 0 ? -3 : 3; // move toward 0
  const next = game.karma + bleed;
  await db().from("games").update({ karma: next }).eq("id", game.id);
  // Keep the caller's copy in sync. applyDelta later computes karma from this
  // object — without this the bleed is silently reverted whenever the DM also
  // reports a karma delta, so karma never drains and cash-ins re-fire forever.
  game.karma = next;
  return dir;
}
