"use client";

import { useEffect, useRef, useState } from "react";
import type { DiceResult } from "@/lib/types";
import type { AwaitingRoll } from "@/lib/turn";
import { statColor } from "@/lib/ui";
import { IconD20 } from "./Icons";

// Shared input for entering physical dice results (1 or 2 values by mode).
function ManualDiceEntry({
  count,
  onSubmit,
  compact,
}: {
  count: number;
  onSubmit: (values: number[]) => void;
  compact?: boolean;
}) {
  const [vals, setVals] = useState<string[]>(Array(count).fill(""));
  const parsed = vals.map((v) => parseInt(v, 10));
  const valid = parsed.every((n) => Number.isInteger(n) && n >= 1 && n <= 20);

  return (
    <div className={`flex items-end gap-2 ${compact ? "" : "flex-wrap"}`}>
      {vals.map((v, i) => (
        <input
          key={i}
          type="number"
          min={1}
          max={20}
          inputMode="numeric"
          value={v}
          onChange={(e) => {
            const next = [...vals];
            next[i] = e.target.value;
            setVals(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) onSubmit(parsed);
          }}
          placeholder={count === 2 ? `d20 #${i + 1}` : "1–20"}
          aria-label={count === 2 ? `Physical die ${i + 1} result` : "Physical die result"}
          className="w-20 rounded-lg border border-void-700 bg-void-900/50 px-3 py-2 text-center font-mono text-sm outline-none transition-colors duration-200 placeholder:text-faint focus:border-neon/60"
        />
      ))}
      <button
        onClick={() => valid && onSubmit(parsed)}
        disabled={!valid}
        className="cursor-pointer rounded-lg border border-void-700 px-3.5 py-2 font-mono text-xs uppercase tracking-wider text-dim transition-colors duration-200 hover:border-neon/50 hover:text-neon disabled:cursor-default disabled:opacity-40"
      >
        Use my roll
      </button>
    </div>
  );
}

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
      {dice.mode && dice.mode !== "normal" && (
        <span
          className={`rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
            dice.mode === "advantage" ? "border-jade/60 text-jade" : "border-chili/60 text-chili"
          }`}
        >
          {dice.mode === "advantage" ? "ADV" : "DIS"}
        </span>
      )}
      {dice.manual && (
        <span
          className="rounded-md border border-void-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-dim"
          title="Rolled with physical dice at the table"
        >
          IRL
        </span>
      )}
      <span className="opacity-80">
        d20&nbsp;{dice.d20}
        {dice.d20b !== null && dice.d20b !== undefined && (
          <span className="line-through opacity-50">&nbsp;{dice.d20b}</span>
        )}
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
  onManual,
}: {
  awaiting: AwaitingRoll;
  rolling: boolean;
  onRoll: () => void;
  onManual?: (values: number[]) => void;
}) {
  const c = statColor(awaiting.stat);
  const mode = awaiting.mode ?? "normal";
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
      {mode !== "normal" && (
        <p className="mt-2 flex items-center gap-2 text-sm">
          <span
            className={`rounded-md border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider ${
              mode === "advantage" ? "border-jade/60 text-jade" : "border-chili/60 text-chili"
            }`}
          >
            {mode === "advantage" ? "Advantage · roll 2, keep higher" : "Disadvantage · roll 2, keep lower"}
          </span>
          {awaiting.mode_reason && <span className="italic text-dim">{awaiting.mode_reason}</span>}
        </p>
      )}
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

      {onManual && !rolling && (
        <div className="mt-4 border-t border-void-700/60 pt-3.5">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-dim">
            Got real dice? Roll at the table, enter the result
            {mode !== "normal" ? " — two dice" : ""}
          </p>
          <ManualDiceEntry count={mode === "normal" ? 1 : 2} onSubmit={onManual} />
        </div>
      )}
    </div>
  );
}

// The cinematic moment: full-screen overlay while the die is in the air, then
// the result bursts in its outcome colour before handing back to the story.
// If the player still holds heng and hasn't rerolled this check, the settled
// result becomes a decision: accept fate, or burn a token (second roll stands).
export function RollOverlay({
  dice,
  hengLeft = 0,
  canReroll = false,
  onAccept,
  onReroll,
  onCancel,
}: {
  dice: DiceResult | null;
  hengLeft?: number;
  canReroll?: boolean;
  onAccept?: () => void;
  onReroll?: (manual?: number[]) => void;
  onCancel?: () => void;
}) {
  const [display, setDisplay] = useState<number>(1);
  const [settled, setSettled] = useState(false);
  const [manualReroll, setManualReroll] = useState(false);
  const [stuck, setStuck] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Escape hatch: if the die is still churning after 8s, something upstream
  // failed — offer a way out instead of spinning forever.
  useEffect(() => {
    if (dice) {
      setStuck(false);
      return;
    }
    const t = setTimeout(() => setStuck(true), 8000);
    return () => clearTimeout(t);
  }, [dice]);

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
    ? "#33291d"
    : dice.outcome === "nat20"
      ? "#93600d"
      : dice.outcome === "nat1"
        ? "#bf4028"
        : dice.outcome === "success"
          ? "#2a6e50"
          : "#75674f";

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
            style={{ color: settled ? outcomeColor : "#33291d" }}
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
            {dice.mode !== "normal" && dice.d20b !== null && (
              <p className="mt-1.5 font-mono text-xs uppercase tracking-widest text-dim">
                {dice.mode === "advantage" ? "advantage" : "disadvantage"} · rolled {dice.d20} &{" "}
                <span className="line-through">{dice.d20b}</span> · kept {dice.d20}
              </p>
            )}
            <p className="mt-2 font-mono text-sm text-dim">
              <span style={{ color: statColor(dice.stat) }}>{dice.stat}</span> · d20 {dice.d20}
              {dice.statMod !== 0 && ` ${dice.statMod > 0 ? "+" : ""}${dice.statMod}`}
              {dice.stateMod !== 0 && ` ${dice.stateMod > 0 ? "+" : ""}${dice.stateMod}`} ={" "}
              {dice.total} vs DC {dice.dc}
            </p>

            {onAccept && !manualReroll && (
              <div className="mt-7 flex items-center justify-center gap-3">
                <button
                  onClick={onAccept}
                  autoFocus
                  className="cursor-pointer rounded-xl bg-neon px-6 py-3 font-semibold text-ink shadow-glow transition-all duration-200 hover:brightness-110"
                >
                  Accept fate
                </button>
                {canReroll && hengLeft > 0 && onReroll && (
                  <button
                    onClick={() => (dice?.manual ? setManualReroll(true) : onReroll())}
                    className="cursor-pointer rounded-xl border border-chili/60 px-6 py-3 font-semibold text-chili transition-colors duration-200 hover:bg-chili/10"
                    title="Second roll stands — even if it's worse"
                  >
                    洗 Reroll · heng ×{hengLeft}
                  </button>
                )}
              </div>
            )}
            {onAccept && !manualReroll && canReroll && hengLeft > 0 && (
              <p className="mt-2.5 font-mono text-[10px] uppercase tracking-widest text-dim">
                second roll stands, even if worse
              </p>
            )}
            {manualReroll && onReroll && dice && (
              <div className="mt-6 flex flex-col items-center gap-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-dim">
                  Roll your real {dice.mode !== "normal" ? "dice" : "die"} again — enter the result
                </p>
                <ManualDiceEntry
                  count={dice.mode !== "normal" ? 2 : 1}
                  compact
                  onSubmit={(vals) => {
                    setManualReroll(false);
                    onReroll(vals);
                  }}
                />
              </div>
            )}
          </div>
        )}

        {!dice && stuck && onCancel && (
          <button
            onClick={onCancel}
            className="animate-fadeup mt-8 cursor-pointer rounded-xl border border-void-700 px-5 py-2.5 font-mono text-xs uppercase tracking-wider text-dim transition-colors duration-200 hover:border-chili/50 hover:text-chili"
          >
            The die is stuck — put it down
          </button>
        )}
      </div>
    </div>
  );
}
