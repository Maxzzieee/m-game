import crypto from "node:crypto";
import { DiceResult, Game, MentalState, StatKey } from "./types";

// Server-side, auditable d20. This is what enforces "the DM never rolls for the
// player" — the die lives here, not in the model.

const STATE_MOD: Record<MentalState, number> = {
  Fresh: 0,
  Tired: -1,
  Stress: -2,
  "Burnt Out": -3,
  "On Fire": 2,
};

const STAT_MAP: Record<string, StatKey> = {
  BRAINS: "brains",
  FACE: "face",
  BRAWN: "brawn",
  GUTS: "guts",
};

function d20(): number {
  // crypto for a fair, non-predictable roll
  return (crypto.randomInt(20) as number) + 1; // 1..20
}

export function rollCheck(game: Game, statLabel: string, dc: number): DiceResult {
  const key = STAT_MAP[statLabel.toUpperCase()] ?? "guts";
  const statMod = game[key] as number;
  const stateMod = STATE_MOD[game.mental_state] ?? 0;
  const raw = d20();
  const total = raw + statMod + stateMod;

  let outcome: DiceResult["outcome"];
  if (raw === 1) outcome = "nat1";
  else if (raw === 20) outcome = "nat20";
  else if (total >= dc) outcome = "success";
  else outcome = "fail";

  return {
    stat: statLabel.toUpperCase(),
    dc,
    d20: raw,
    statMod,
    stateMod,
    total,
    outcome,
    margin: total - dc,
  };
}

// A plain 1d100 for character-creation rolls (SES, Looks).
export function d100(): number {
  return (crypto.randomInt(100) as number) + 1;
}
