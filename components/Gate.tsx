"use client";

import { useState } from "react";
import { IconLock } from "./Icons";

export default function Gate({ onAuthed }: { onAuthed: () => void }) {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch("/api/gate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode: pass }),
    });
    setBusy(false);
    if (res.ok) onAuthed();
    else setErr("Wrong lah. Try again.");
  }

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm animate-fadeup">
        <div className="mb-10 text-center">
          {/* stylised crescent + five stars — a national flourish, not the state emblem */}
          <svg
            viewBox="0 0 120 40"
            className="mx-auto mb-5 h-9 w-auto text-neon"
            fill="currentColor"
            aria-hidden
          >
            <path d="M28 20a14 14 0 1 1-8.5-12.9A11 11 0 1 0 19.5 32.9 14 14 0 0 1 28 20z" />
            <g>
              {[
                [48, 12],
                [63, 12],
                [55.5, 22],
                [51, 30],
                [60, 30],
              ].map(([cx, cy], i) => (
                <path
                  key={i}
                  transform={`translate(${cx} ${cy}) scale(0.85)`}
                  d="M0 -5 L1.18 -1.6 L4.76 -1.55 L1.9 0.6 L2.94 4.05 L0 2 L-2.94 4.05 L-1.9 0.6 L-4.76 -1.55 L-1.18 -1.6 Z"
                />
              ))}
            </g>
          </svg>
          <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-dim">
            est. 2016 · block 247
          </p>
          <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight">
            Singapore <em className="text-neon">Life</em> Sim
          </h1>
          <p className="mx-auto mt-4 max-w-[26ch] font-serif text-[15px] italic leading-relaxed text-dim">
            You are 13. The uniform still smells like the packaging. The rest of your life
            starts now.
          </p>
        </div>

        <label
          htmlFor="passcode"
          className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.25em] text-dim"
        >
          <IconLock className="h-3.5 w-3.5" /> Passcode
        </label>
        <input
          id="passcode"
          autoFocus
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          className="w-full rounded-xl border border-void-700 bg-void-800 px-4 py-3.5 font-mono tracking-widest shadow-card outline-none transition-colors duration-200 focus:border-neon/70"
          placeholder="······"
        />
        {err && <p className="mt-3 text-sm text-chili">{err}</p>}
        <button
          disabled={busy}
          className="mt-5 w-full cursor-pointer rounded-xl bg-neon px-4 py-3.5 font-semibold text-ink shadow-glow transition-all duration-200 hover:brightness-110 disabled:cursor-default disabled:opacity-50"
        >
          {busy ? "Checking..." : "Enter the void deck"}
        </button>
      </form>
    </main>
  );
}
