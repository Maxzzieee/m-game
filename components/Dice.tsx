"use client";

import type { DiceResult } from "@/lib/types";
import type { AwaitingRoll } from "@/lib/turn";
import { IconD20 } from "./Icons";

export function DiceChip({ dice }: { dice: DiceResult }) {
  const tone =
    dice.outcome === "nat20"
      ? "border-neon/70 text-neon shadow-glow"
      : dice.outcome === "nat1"
        ? "border-chili/70 text-chili"
        : dice.outcome === "success"
          ? "border-jade/60 text-jade"
          : "border-void-700 text-dim";
  const label =
    dice.outcome === "nat20"
      ? "NAT 20 · LEGENDARY"
      : dice.outcome === "nat1"
        ? "NAT 1 · CATASTROPHE"
        : dice.outcome === "success"
          ? "SUCCESS"
          : "FAILED";

  return (
    <div
      className={`my-3 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-void-800/70 px-4 py-2.5 font-mono text-[13px] shadow-card ${tone}`}
    >
      <IconD20 className="h-5 w-5 shrink-0" />
      <span>
        {dice.stat} <span className="opacity-60">vs DC {dice.dc}</span>
      </span>
      <span className="opacity-80">
        d20&nbsp;{dice.d20}
        {dice.statMod !== 0 && ` ${dice.statMod > 0 ? "+" : ""}${dice.statMod}`}
        {dice.stateMod !== 0 && ` ${dice.stateMod > 0 ? "+" : ""}${dice.stateMod}`} ={" "}
        {dice.total}
      </span>
      <span className="font-medium tracking-wider">{label}</span>
    </div>
  );
}

// Shown when the DM is waiting on the player. This widget is what makes it
// impossible for the DM to roll for you.
export function RollPrompt({
  awaiting,
  rolling,
  onRoll,
}: {
  awaiting: AwaitingRoll;
  rolling: boolean;
  onRoll: () => void;
}) {
  return (
    <div className="animate-fadeup rounded-2xl border border-neon/40 bg-void-800 p-5 shadow-card">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-dim">
        The dice demand it
      </p>
      <p className="mt-1.5 font-serif text-lg">
        <span className="font-semibold text-neon">{awaiting.stat}</span> check ·{" "}
        <span className="font-mono text-base">DC {awaiting.dc}</span>
        <span className="italic text-dim"> — {awaiting.reason}</span>
      </p>
      <button
        onClick={onRoll}
        disabled={rolling}
        className="mt-4 inline-flex cursor-pointer items-center gap-2.5 rounded-xl bg-neon px-6 py-3 font-semibold text-ink shadow-glow transition-all duration-200 hover:brightness-110 disabled:cursor-default disabled:opacity-60"
      >
        <span className={rolling ? "animate-roll inline-flex" : "inline-flex"}>
          <IconD20 className="h-5 w-5" />
        </span>
        {rolling ? "Rolling..." : "Roll the d20"}
      </button>
    </div>
  );
}
