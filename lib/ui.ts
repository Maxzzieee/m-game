// Client-safe UI helpers: the stat colour language, scene ambiance, choice
// parsing, and turn-delta diffing. Pure functions only.

import type { Game } from "./types";

// ---- stat colour language ----------------------------------------------------
export const STAT_COLOR: Record<string, string> = {
  BRAINS: "#1f6feb",
  FACE: "#b83280",
  BRAWN: "#c2410c",
  GUTS: "#c8102e",
};
export const statColor = (stat: string) => STAT_COLOR[stat.toUpperCase()] ?? "#ce1126";

// ---- scene ambiance ----------------------------------------------------------
// Tint the room to match the scene. Derived from the latest DM event's tags +
// mental state; rendered as a very low-alpha radial wash.
const AMBIANCE: Array<{ match: string[]; color: string }> = [
  { match: ["fight", "gang", "pai kia"], color: "rgba(191, 64, 40, 0.10)" },
  { match: ["crush", "love", "date"], color: "rgba(200, 92, 140, 0.10)" },
  { match: ["ns", "tekong", "camp", "ippt"], color: "rgba(88, 122, 66, 0.13)" },
  { match: ["exam", "school", "class", "study"], color: "rgba(64, 130, 168, 0.10)" },
  { match: ["night", "void deck", "supper", "mrt"], color: "rgba(70, 92, 138, 0.13)" },
  { match: ["family", "home", "cny"], color: "rgba(206, 17, 38, 0.11)" },
];

// Tag-derived scene tint; null when no tag matches (so the calendar layer can
// take over). Mental-state extremes still override the calendar.
export function ambianceFor(tags: string[] | undefined, game: Game): string | null {
  if (game.mental_state === "Burnt Out") return "rgba(163, 18, 43, 0.07)";
  if (game.mental_state === "On Fire") return "rgba(206, 17, 38, 0.13)";
  const lower = (tags ?? []).map((t) => t.toLowerCase());
  for (const a of AMBIANCE) {
    if (a.match.some((m) => lower.some((t) => t.includes(m)))) return a.color;
  }
  return null;
}

// ---- choice parsing ----------------------------------------------------------
// The DM offers "A) ... / B) ... / C) ..." choices in prose. Surface them as
// tappable buttons. Handles "A)", "**A)**", "A." and "- A)" shapes.
export interface Choice {
  key: string;
  label: string;
}

export function parseChoices(prose: string): Choice[] {
  const out: Choice[] = [];
  const seen = new Set<string>();
  for (const raw of prose.split("\n")) {
    const m = raw.match(/^\s*(?:[-*>]\s*)?(?:\*\*)?\(?([A-D])[).]\)?(?:\*\*)?\s*[—:-]?\s*(.+)$/);
    if (!m) continue;
    const key = m[1].toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const label = m[2].replace(/\*\*/g, "").replace(/\*/g, "").trim();
    if (label.length < 3) continue;
    out.push({ key, label });
  }
  // Only treat it as a choice block if there are at least two options.
  return out.length >= 2 ? out : [];
}

// ---- turn-delta toasts ---------------------------------------------------------
export interface DeltaToast {
  id: string;
  text: string;
  tone: "up" | "down" | "money" | "state";
}

const REP_LABEL: Record<string, string> = {
  rep_academic: "Academic",
  rep_social: "Social",
  rep_street: "Street",
  rep_family: "Family",
  rep_system: "System",
};
const STAT_LABEL: Record<string, string> = {
  brains: "Brains",
  face: "Face",
  brawn: "Brawn",
  guts: "Guts",
};

export function diffGame(prev: Game, next: Game): DeltaToast[] {
  const toasts: DeltaToast[] = [];
  const push = (text: string, tone: DeltaToast["tone"]) =>
    toasts.push({ id: `${text}-${next.turn_no}`, text, tone });

  for (const k of Object.keys(STAT_LABEL) as Array<keyof typeof STAT_LABEL>) {
    const d = (next[k as keyof Game] as number) - (prev[k as keyof Game] as number);
    if (d !== 0) push(`${STAT_LABEL[k]} ${d > 0 ? "+" : ""}${d}`, d > 0 ? "up" : "down");
  }
  for (const k of Object.keys(REP_LABEL) as Array<keyof typeof REP_LABEL>) {
    const d = (next[k as keyof Game] as number) - (prev[k as keyof Game] as number);
    if (d !== 0) push(`${REP_LABEL[k]} ${d > 0 ? "+" : ""}${d}`, d > 0 ? "up" : "down");
  }
  if (typeof next.money === "number" && typeof prev.money === "number" && next.money !== prev.money) {
    const d = next.money - prev.money;
    push(`$${d > 0 ? "+" : ""}${d}`, "money");
  }
  if (next.mental_state !== prev.mental_state) {
    push(`${prev.mental_state} → ${next.mental_state}`, "state");
  }
  if (
    typeof next.heng === "number" &&
    typeof prev.heng === "number" &&
    next.heng !== prev.heng
  ) {
    const d = next.heng - prev.heng;
    push(`Heng ${d > 0 ? "+" : ""}${d}`, d > 0 ? "up" : "down");
  }
  if (next.arc !== prev.arc) {
    push(`ARC ${next.arc} — ${next.arc_name}`, "state");
  }
  return toasts;
}
