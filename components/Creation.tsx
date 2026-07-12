"use client";

import { useEffect, useState } from "react";
import { STEREOTYPE_ORDER, STEREOTYPES } from "@/lib/constants";
import type { Game, Stereotype } from "@/lib/types";
import { IconArrow, IconD20 } from "./Icons";

type Step = "name" | "stereotype" | "roll_ses" | "roll_looks" | "done";

const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

function StatPill({ label, n }: { label: string; n: number }) {
  const tone = n > 1 ? "text-jade" : n < 0 ? "text-chili" : "text-parchment/80";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-void-700 bg-void-900/60 px-2 py-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-dim">{label}</span>
      <span className={`font-mono text-xs font-medium ${tone}`}>{sign(n)}</span>
    </span>
  );
}

// Animated 1d100 reveal: digits churn, then settle on the real roll.
function FateRoll({
  title,
  subtitle,
  roll,
  tier,
  onDone,
}: {
  title: string;
  subtitle: string;
  roll: number;
  tier: string;
  onDone: () => void;
}) {
  const [display, setDisplay] = useState<number | null>(null);
  const [settled, setSettled] = useState(false);

  // No mount guard: the effect must survive strict-mode re-runs, and the
  // component remounts per roll via the `key` prop at the call sites.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplay(roll);
      setSettled(true);
      return;
    }
    setSettled(false);
    let ticks = 0;
    const id = setInterval(() => {
      ticks += 1;
      if (ticks >= 18) {
        clearInterval(id);
        setDisplay(roll);
        setSettled(true);
      } else {
        setDisplay(Math.floor(Math.random() * 100) + 1);
      }
    }, 70);
    return () => clearInterval(id);
  }, [roll]);

  return (
    <div className="animate-fadeup text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-dim">{title}</p>
      <p className="mt-2 font-serif text-lg italic text-dim">{subtitle}</p>

      <div
        className={`mx-auto mt-8 grid h-36 w-36 place-items-center rounded-2xl border bg-void-800 shadow-card transition-colors duration-300 ${
          settled ? "border-neon/60 shadow-glow" : "border-void-700"
        }`}
      >
        <span className={`font-mono text-6xl ${settled ? "text-neon" : "text-parchment/60"}`}>
          {display ?? "--"}
        </span>
      </div>

      <div className={`mt-6 transition-opacity duration-500 ${settled ? "opacity-100" : "opacity-0"}`}>
        <p className="font-serif text-2xl">{tier}</p>
      </div>

      {settled && (
        <button
          onClick={onDone}
          className="mx-auto mt-8 flex cursor-pointer items-center gap-2 rounded-xl bg-neon px-6 py-3 font-semibold text-ink shadow-glow transition-all duration-200 hover:brightness-110"
        >
          Continue <IconArrow />
        </button>
      )}
    </div>
  );
}

export default function Creation({ onCreated }: { onCreated: () => void }) {
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [pick, setPick] = useState<Stereotype | null>(null);
  const [busy, setBusy] = useState(false);
  const [game, setGame] = useState<Game | null>(null);

  // Both d100s are rolled server-side when the character is created; the
  // ceremony reveals them one at a time.
  async function createAndRoll() {
    if (!name.trim() || !pick || busy) return;
    setBusy(true);
    const res = await fetch("/api/character", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ char_name: name.trim(), stereotype: pick }),
    });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      setGame(data.game);
      setStep("roll_ses");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-12">
      {/* progress */}
      <div className="mb-10 flex items-center justify-center gap-2" aria-hidden>
        {["name", "stereotype", "roll_ses", "roll_looks"].map((s, i) => {
          const order: Step[] = ["name", "stereotype", "roll_ses", "roll_looks", "done"];
          const active = order.indexOf(step) >= i;
          return (
            <div
              key={s}
              className={`h-1 w-10 rounded-full transition-colors duration-300 ${
                active ? "bg-neon" : "bg-void-700"
              }`}
            />
          );
        })}
      </div>

      {step === "name" && (
        <div className="animate-fadeup">
          <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-dim">
            Orientation Day · January 2016
          </p>
          <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight">
            But before we get to that —{" "}
            <em className="text-neon">who are you?</em>
          </h1>

          <label
            htmlFor="charname"
            className="mt-10 block font-mono text-[11px] uppercase tracking-[0.25em] text-dim"
          >
            Your name
          </label>
          <input
            id="charname"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && setStep("stereotype")}
            placeholder="e.g. Wei Jie, Farhan, Priya..."
            className="mt-2 w-full rounded-xl border border-void-700 bg-void-800 px-4 py-3.5 font-serif text-lg shadow-card outline-none transition-colors duration-200 focus:border-neon/70"
          />
          <button
            onClick={() => setStep("stereotype")}
            disabled={!name.trim()}
            className="mt-6 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-neon px-4 py-3.5 font-semibold text-ink transition-all duration-200 hover:brightness-110 disabled:cursor-default disabled:opacity-40"
          >
            That&apos;s me <IconArrow />
          </button>
        </div>
      )}

      {step === "stereotype" && (
        <div className="animate-fadeup">
          <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-dim">
            Step two · the mould
          </p>
          <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight">
            Every school got the same five kinds of kid.
            <br />
            <em className="text-neon">Which one is {name.trim() || "you"}?</em>
          </h1>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {STEREOTYPE_ORDER.map((s) => {
              const info = STEREOTYPES[s];
              const active = pick === s;
              return (
                <button
                  key={s}
                  onClick={() => setPick(s)}
                  className={`cursor-pointer rounded-2xl border p-4 text-left shadow-card transition-colors duration-200 ${
                    active
                      ? "border-neon/70 bg-void-700/50"
                      : "border-void-700 bg-void-800 hover:border-dim/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-lg font-medium">{s}</span>
                    {active && <span className="h-2 w-2 rounded-full bg-neon" aria-hidden />}
                  </div>
                  <p className="mt-1 font-serif text-sm italic leading-snug text-dim">
                    &ldquo;{info.flavour}&rdquo;
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <StatPill label="Brains" n={info.brains} />
                    <StatPill label="Face" n={info.face} />
                    <StatPill label="Brawn" n={info.brawn} />
                    <StatPill label="Guts" n={info.guts} />
                  </div>
                </button>
              );
            })}
          </div>

          <button
            onClick={createAndRoll}
            disabled={!pick || busy}
            className="mt-8 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-neon px-4 py-3.5 font-semibold text-ink shadow-glow transition-all duration-200 hover:brightness-110 disabled:cursor-default disabled:opacity-40"
          >
            <IconD20 className="h-5 w-5" />
            {busy ? "Consulting fate..." : "Lock in — let fate roll the rest"}
          </button>
          <p className="mt-3 text-center font-serif text-sm italic text-dim">
            Your family and your face are not up to you. That&apos;s the point.
          </p>
        </div>
      )}

      {step === "roll_ses" && game && (
        <FateRoll
          key="ses"
          title="Fate roll I · 1d100"
          subtitle="The household you were born into"
          roll={game.ses_roll}
          tier={game.ses_tier}
          onDone={() => setStep("roll_looks")}
        />
      )}

      {step === "roll_looks" && game && (
        <FateRoll
          key="looks"
          title="Fate roll II · 1d100"
          subtitle="What puberty decided to do with you"
          roll={game.looks_roll}
          tier={game.looks_tier}
          onDone={() => setStep("done")}
        />
      )}

      {step === "done" && game && (
        <div className="animate-fadeup text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-dim">
            The dice have decided
          </p>
          <h1 className="mt-4 font-serif text-4xl font-medium">{game.char_name}</h1>
          <p className="mt-2 font-serif text-lg italic text-dim">
            {game.stereotype} · {game.ses_tier} · {game.looks_tier}
          </p>
          <p className="mx-auto mt-6 max-w-[34ch] font-serif italic leading-relaxed text-parchment/80">
            &ldquo;{STEREOTYPES[game.stereotype].flavour}&rdquo;
          </p>
          <button
            onClick={onCreated}
            className="mx-auto mt-10 flex cursor-pointer items-center gap-2 rounded-xl bg-neon px-8 py-3.5 font-semibold text-ink shadow-glow transition-all duration-200 hover:brightness-110 animate-pulseglow"
          >
            Begin Secondary One <IconArrow />
          </button>
        </div>
      )}
    </main>
  );
}
