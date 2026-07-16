// Shop catalog — pure data, safe for client import. Gear shows up on the pixel
// avatar; consumables patch mental state.

import type { MentalState } from "./types";

export type ShopItemId =
  | "kopi_peng"
  | "bubble_tea"
  | "snapback"
  | "specs"
  | "gold_chain"
  | "headphones";

export interface ShopItem {
  id: ShopItemId;
  name: string;
  price: number;
  kind: "gear" | "consumable";
  blurb: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: "kopi_peng",
    name: "Kopi peng",
    price: 4,
    kind: "consumable",
    blurb: "Ice-cold from the kopitiam auntie. Takes the edge off. (+1 mental state step)",
  },
  {
    id: "bubble_tea",
    name: "Brown sugar BBT",
    price: 7,
    kind: "consumable",
    blurb: "Queue 20 minutes, regret nothing. (+1 mental state step)",
  },
  {
    id: "snapback",
    name: "Snapback cap",
    price: 15,
    kind: "gear",
    blurb: "Bought at Bugis Street. Instant +2 perceived swagger (not a real stat).",
  },
  {
    id: "specs",
    name: "Black-frame specs",
    price: 12,
    kind: "gear",
    blurb: "You don't need them. That's not the point.",
  },
  {
    id: "headphones",
    name: "Over-ear headphones",
    price: 28,
    kind: "gear",
    blurb: "The universal 'don't talk to me on the MRT' signal.",
  },
  {
    id: "gold_chain",
    name: "Gold chain",
    price: 60,
    kind: "gear",
    blurb: "Ah Beng heritage collection. Your Ah Ma will have questions.",
  },
];

export const shopItem = (id: string) => SHOP_ITEMS.find((i) => i.id === id) ?? null;

// One step back toward Fresh. On Fire is untouchable (it's earned, not bought).
export function improveMentalState(current: MentalState): MentalState {
  switch (current) {
    case "Burnt Out":
      return "Stress";
    case "Stress":
      return "Tired";
    case "Tired":
      return "Fresh";
    default:
      return current;
  }
}
