import crypto from "node:crypto";
import type { DiceResult, Game, MentalState, RollMode, StatKey } from "./types";

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

export function rollCheck(
  game: Game,
  statLabel: string,
  dc: number,
  mode: RollMode = "normal",
  // Physical dice at the table: the player rolls IRL and enters the result(s).
  // One value for a normal check, two for advantage/disadvantage.
  manual?: number[],
): DiceResult {
  const key = STAT_MAP[statLabel.toUpperCase()] ?? "guts";
  const statMod = game[key] as number;
  const stateMod = STATE_MOD[game.mental_state] ?? 0;

  const isManual = Array.isArray(manual) && manual.length > 0;
  const die = (i: number) =>
    isManual && typeof manual![i] === "number"
      ? Math.max(1, Math.min(20, Math.round(manual![i])))
      : d20();

  // Advantage / disadvantage: two dice, keep higher / lower. Nat 1 / Nat 20 is
  // judged on the KEPT die (5e convention).
  const a = die(0);
  let kept = a;
  let discarded: number | null = null;
  if (mode === "advantage" || mode === "disadvantage") {
    const b = die(1);
    kept = mode === "advantage" ? Math.max(a, b) : Math.min(a, b);
    discarded = mode === "advantage" ? Math.min(a, b) : Math.max(a, b);
  }

  const total = kept + statMod + stateMod;

  let outcome: DiceResult["outcome"];
  if (kept === 1) outcome = "nat1";
  else if (kept === 20) outcome = "nat20";
  else if (total >= dc) outcome = "success";
  else outcome = "fail";

  return {
    stat: statLabel.toUpperCase(),
    dc,
    d20: kept,
    d20b: discarded,
    mode,
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
