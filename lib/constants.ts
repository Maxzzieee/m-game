// Pure, dependency-free game data — safe to import into client components.

import { Stereotype } from "./types";

export const STEREOTYPES: Record<
  Stereotype,
  { brains: number; face: number; brawn: number; guts: number; flavour: string }
> = {
  Mugger: { brains: 3, face: 1, brawn: -1, guts: 1, flavour: "Ten-year series is my bible." },
  Athlete: { brains: -1, face: 1, brawn: 3, guts: 1, flavour: "CCA more important than class." },
  Joker: {
    brains: 1,
    face: 3,
    brawn: 1,
    guts: -1,
    flavour: "Make them laugh, they won't notice I'm dying inside.",
  },
  "Pai Kia": {
    brains: -1,
    face: 1,
    brawn: 1,
    guts: 3,
    flavour: "Rules are suggestions. Fear is a choice.",
  },
  "Average Joe": { brains: 1, face: 1, brawn: 1, guts: 1, flavour: "Just trying to survive lah." },
};

export const STEREOTYPE_ORDER: Stereotype[] = [
  "Mugger",
  "Athlete",
  "Joker",
  "Pai Kia",
  "Average Joe",
];

export function sesTier(roll: number): string {
  if (roll <= 15) return "Rental flat / low income";
  if (roll <= 40) return "HDB heartland / working class";
  if (roll <= 70) return "HDB upgraded / middle class";
  if (roll <= 90) return "Condo / upper-middle";
  return "Landed / wealthy";
}

export function looksTier(roll: number): string {
  if (roll <= 15) return "Below average";
  if (roll <= 40) return "Average";
  if (roll <= 70) return "Above average";
  if (roll <= 90) return "Attractive";
  return "Stunning";
}
