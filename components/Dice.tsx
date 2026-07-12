"use client";

import { useEffect, useRef, useState } from "react";
import type { DiceResult } from "@/lib/types";
import type { AwaitingRoll } from "@/lib/turn";
import { statColor } from "@/lib/ui";
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
      <span style={{ color: statColor(dice.stat) }}>{dice.stat}</span>
      <span className="opacity-60">vs DC {dice.dc}</span>
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
  const c = statColor(awaiting.stat);
  return (
    <div
      className="animate-fadeup rounded-2xl border bg-void-800 p-5 shadow-card"
      style={{ borderColor: `${c}66` }}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-dim">
        The dice demand it
      </p>
      <p className="mt-1.5 font-serif text-lg">
        <span className="font-semibold" style={{ color: c }}>
          {awaiting.stat}
        </span>{" "}
        check · <span className="font-mono text-base">DC {awaiting.dc}</span>
        <span className="italic text-dim"> — {awaiting.reason}</span>
      </p>
      <button
        onClick={onRoll}
        disabled={rolling}
        className="mt-4 inline-flex cursor-pointer items-center gap-2.5 rounded-xl px-6 py-3 font-semibold text-ink transition-all duration-200 hover:brightness-110 disabled:cursor-default disabled:opacity-60"
        style={{ backgroundColor: c, boxShadow: `0 0 24px -6px ${c}59` }}
      >
        <span className={rolling ? "animate-roll inline-flex" : "inline-flex"}>
          <IconD20 className="h-5 w-5" />
        </span>
        {rolling ? "Rolling..." : "Roll the d20"}
      </button>
    </div>
  );
}

// The cinematic moment: full-screen overlay while the die is in the air, then
// the result bursts in its outcome colour before handing back to the story.
export function RollOverlay({ dice }: { dice: DiceResult | null }) {
  const [display, setDisplay] = useState<number>(1);
  const [settled, setSettled] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (dice && reduced) {
      setDisplay(dice.d20);
      setSettled(true);
      return;
    }
    if (!dice) {
      // still in the air — churn
      setSettled(false);
      timer.current = setInterval(() => setDisplay(Math.floor(Math.random() * 20) + 1), 65);
      return () => {
        if (timer.current) clearInterval(timer.current);
      };
    }
    // result arrived — settle
    if (timer.current) clearInterval(timer.current);
    setDisplay(dice.d20);
    setSettled(true);
  }, [dice]);

  const outcomeColor = !dice
    ? "#ece5d8"
    : dice.outcome === "nat20"
      ? "#f0a63e"
      : dice.outcome === "nat1"
        ? "#e5533d"
        : dice.outcome === "success"
          ? "#57b389"
          : "#a1957f";

  const label = !dice
    ? ""
    : dice.outcome === "nat20"
      ? "NATURAL TWENTY"
      : dice.outcome === "nat1"
        ? "NATURAL ONE"
        : dice.outcome === "success"
          ? "SUCCESS"
          : "FAILED";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-void-900/85 backdrop-blur-sm">
      <div className="text-center">
        <div
          className={`relative mx-auto grid h-40 w-40 place-items-center ${settled ? "" : "animate-roll"}`}
          style={{
            filter: settled ? `drop-shadow(0 0 30px ${outcomeColor}80)` : undefined,
            transition: "filter 300ms ease",
          }}
        >
          <IconD20 className="absolute inset-0 h-full w-full" />
          <span
            className="relative font-mono text-5xl font-medium"
            style={{ color: settled ? outcomeColor : "#ece5d8" }}
          >
            {display}
          </span>
        </div>
        {settled && dice && (
          <div className="animate-fadeup mt-6">
            <p
              className="font-serif text-3xl font-medium tracking-wide"
              style={{ color: outcomeColor }}
            >
              {label}
            </p>
            <p className="mt-2 font-mono text-sm text-dim">
              <span style={{ color: statColor(dice.stat) }}>{dice.stat}</span> · d20 {dice.d20}
              {dice.statMod !== 0 && ` ${dice.statMod > 0 ? "+" : ""}${dice.statMod}`}
              {dice.stateMod !== 0 && ` ${dice.stateMod > 0 ? "+" : ""}${dice.stateMod}`} ={" "}
              {dice.total} vs DC {dice.dc}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
