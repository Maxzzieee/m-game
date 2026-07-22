"use client";

import { useEffect, useState } from "react";
import { STEREOTYPE_ORDER, STEREOTYPES } from "@/lib/constants";
import type { Game, GameMode, Stereotype } from "@/lib/types";
import { IconArrow, IconD20 } from "./Icons";

type Step = "mode" | "name" | "dream" | "stereotype" | "roll_ses" | "roll_looks" | "done";

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
  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<GameMode>("story");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"girl" | "boy">("boy");
  const [dream, setDream] = useState(""); // sandbox: the founding dream
  const [pick, setPick] = useState<Stereotype | "custom" | null>(null);
  const [customText, setCustomText] = useState("");
  const [busy, setBusy] = useState(false);
  const [game, setGame] = useState<Game | null>(null);

  const customReady = pick !== "custom" || customText.trim().length >= 10;

  // Both d100s are rolled server-side when the character is created; the
  // ceremony reveals them one at a time.
  async function createAndRoll() {
    if (!name.trim() || !pick || !customReady || busy) return;
    setBusy(true);
    const dreamArg = mode === "sandbox" ? dream.trim() : undefined;
    const body =
      pick === "custom"
        ? { char_name: name.trim(), custom: customText.trim(), mode, dream: dreamArg, gender }
        : { char_name: name.trim(), stereotype: pick, mode, dream: dreamArg, gender };
    const res = await fetch("/api/character", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      setGame(data.game);
      setStep("roll_ses");
    }
  }

  return (
    <main className="relative mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-12">
      <button
        onClick={async () => {
          await fetch("/api/logout", { method: "POST" });
          window.location.reload();
        }}
        className="absolute right-6 top-5 cursor-pointer font-mono text-[10px] uppercase tracking-[0.25em] text-faint transition-colors duration-200 hover:text-parchment/80"
      >
        Log out
      </button>
      {/* progress */}
      <div className="mb-10 flex items-center justify-center gap-2" aria-hidden>
        {["mode", "name", "stereotype", "roll_ses", "roll_looks"].map((s, i) => {
          const order: Step[] = ["mode", "name", "stereotype", "roll_ses", "roll_looks", "done"];
          // the sandbox-only "dream" step shares the "name" slot on the bar
          const pStep = step === "dream" ? "name" : step;
          const active = order.indexOf(pStep) >= i;
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

      {step === "mode" && (
        <div className="animate-fadeup">
          <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-dim">
            Before anything · choose your world
          </p>
          <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight">
            How do you want to <em className="text-neon">play</em>?
          </h1>
          <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-dim">
            This sets the whole feel of your game. You can&apos;t change it later — start a
            fresh life if you want the other one.
          </p>

          <div className="mt-8 grid gap-3">
            {(
              [
                {
                  id: "story" as const,
                  title: "Story",
                  tag: "dice · stakes · a real life",
                  blurb:
                    "A grounded life with real odds. You roll for what matters, you can fail, and you earn your wins across the years. Adversity is the point.",
                },
                {
                  id: "sandbox" as const,
                  title: "Sandbox — Wishgranter",
                  tag: "no dice · wishes granted · a mirrored cost",
                  blurb:
                    "Say what you want and the world gives it to you — instantly, fully, however big. No rolls, no grind, no failure. But every wish has a true price, and the game names it. Go crazy; just know what it costs.",
                },
              ]
            ).map((m) => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`cursor-pointer rounded-2xl border p-5 text-left shadow-card transition-colors duration-200 ${
                    active ? "border-neon/70 bg-void-700/50" : "border-void-700 bg-void-800 hover:border-dim/50"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-serif text-xl font-medium">{m.title}</span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-neon/80">
                      {m.tag}
                    </span>
                  </div>
                  <p className="mt-2 text-[14px] leading-relaxed text-parchment/80">{m.blurb}</p>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setStep("name")}
            className="mt-8 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-neon px-4 py-3.5 font-semibold text-ink transition-all duration-200 hover:brightness-110"
          >
            {mode === "sandbox" ? "Enter the Wishgranter" : "Begin a life"} <IconArrow />
          </button>
        </div>
      )}

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
            onKeyDown={(e) =>
              e.key === "Enter" && name.trim() && setStep(mode === "sandbox" ? "dream" : "stereotype")
            }
            placeholder="e.g. Wei Jie, Farhan, Priya..."
            className="mt-2 w-full rounded-xl border border-void-700 bg-void-800 px-4 py-3.5 font-serif text-lg shadow-card outline-none transition-colors duration-200 focus:border-neon/70"
          />

          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.25em] text-dim">
            You&apos;re a…
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {(["girl", "boy"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGender(g)}
                className={`cursor-pointer rounded-xl border py-3 font-serif text-lg capitalize shadow-card transition-colors duration-200 ${
                  gender === g
                    ? "border-neon/70 bg-void-700/50 text-parchment"
                    : "border-void-700 bg-void-800 text-dim hover:border-dim/50"
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          <button
            onClick={() => setStep(mode === "sandbox" ? "dream" : "stereotype")}
            disabled={!name.trim()}
            className="mt-6 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-neon px-4 py-3.5 font-semibold text-ink transition-all duration-200 hover:brightness-110 disabled:cursor-default disabled:opacity-40"
          >
            That&apos;s me <IconArrow />
          </button>
        </div>
      )}

      {step === "dream" && (
        <div className="animate-fadeup">
          <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-dim">
            The Wishgranter · your founding dream
          </p>
          <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight">
            So — what do you want your <em className="text-neon">life</em> to be?
          </h1>
          <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-dim">
            Say it plain, in your own words. This is the dream the whole life flows from — the
            world will grant it, name what it costs, and let you decide whether to live it.
          </p>
          <textarea
            autoFocus
            value={dream}
            onChange={(e) => setDream(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && dream.trim()) {
                e.preventDefault();
                setStep("stereotype");
              }
            }}
            rows={3}
            placeholder="e.g. I want to be a footballer. / I want to build something the whole world uses. / I want to be a movie star."
            className="mt-6 w-full resize-none rounded-xl border border-void-700 bg-void-800 px-4 py-3.5 font-serif text-lg leading-relaxed shadow-card outline-none transition-colors duration-200 placeholder:text-faint/70 focus:border-neon/70"
          />
          <button
            onClick={() => setStep("stereotype")}
            disabled={!dream.trim()}
            className="mt-6 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-neon px-4 py-3.5 font-semibold text-ink transition-all duration-200 hover:brightness-110 disabled:cursor-default disabled:opacity-40"
          >
            That&apos;s the dream <IconArrow />
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

            {/* none of the boxes fit? */}
            <button
              onClick={() => setPick("custom")}
              className={`cursor-pointer rounded-2xl border border-dashed p-4 text-left shadow-card transition-colors duration-200 ${
                pick === "custom"
                  ? "border-neon/70 bg-void-700/50"
                  : "border-void-700 bg-void-800/60 hover:border-dim/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-serif text-lg font-medium">Write your own</span>
                {pick === "custom" && <span className="h-2 w-2 rounded-full bg-neon" aria-hidden />}
              </div>
              <p className="mt-1 font-serif text-sm italic leading-snug text-dim">
                &ldquo;None of these boxes fit me.&rdquo;
              </p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-faint">
                Describe yourself — the game reads you and sets your stats (same budget as
                everyone)
              </p>
            </button>
          </div>

          {pick === "custom" && (
            <div className="animate-fadeup mt-4">
              <textarea
                autoFocus
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="e.g. The kid who draws manga at the back of class, knows every bus route in the East, and never raises his hand even when he knows the answer…"
                className="w-full resize-none rounded-xl border border-void-700 bg-void-800 px-4 py-3 font-serif text-[15px] leading-relaxed shadow-card outline-none transition-colors duration-200 placeholder:text-faint focus:border-neon/70"
              />
              {!customReady && (
                <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-faint">
                  a little more — give the game something to read
                </p>
              )}
            </div>
          )}

          <button
            onClick={createAndRoll}
            disabled={!pick || !customReady || busy}
            className="mt-8 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-neon px-4 py-3.5 font-semibold text-ink shadow-glow transition-all duration-200 hover:brightness-110 disabled:cursor-default disabled:opacity-40"
          >
            <IconD20 className="h-5 w-5" />
            {busy
              ? pick === "custom"
                ? "Reading you..."
                : "Consulting fate..."
              : "Lock in — let fate roll the rest"}
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
            &ldquo;
            {(game.meta as { flavour?: string })?.flavour ??
              STEREOTYPES[game.stereotype as Stereotype]?.flavour ??
              ""}
            &rdquo;
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
