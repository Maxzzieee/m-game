import crypto from "node:crypto";
import { db } from "./supabase";
import { STEREOTYPES, looksTier, sesTier } from "./constants";
import { Game, Stereotype } from "./types";

export { STEREOTYPES, looksTier, sesTier };

export async function createGame(input: {
  char_name: string;
  stereotype: Stereotype;
  ses_roll: number;
  looks_roll: number;
}): Promise<Game> {
  const s = STEREOTYPES[input.stereotype];
  const { data, error } = await db()
    .from("games")
    .insert({
      char_name: input.char_name,
      stereotype: input.stereotype,
      ses_roll: input.ses_roll,
      ses_tier: sesTier(input.ses_roll),
      looks_roll: input.looks_roll,
      looks_tier: looksTier(input.looks_roll),
      brains: s.brains,
      face: s.face,
      brawn: s.brawn,
      guts: s.guts,
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

export async function latestGame(): Promise<Game | null> {
  const { data } = await db()
    .from("games")
    .select("*")
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
  await db().from("games").update({ karma: game.karma + bleed }).eq("id", game.id);
  return dir;
}
