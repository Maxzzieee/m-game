"use client";

import { useEffect, useState } from "react";
import { IconClose } from "./Icons";

interface Life {
  id: string;
  char_name: string;
  mode: "story" | "sandbox";
  arc: number;
  arc_name: string;
  age: number;
  ingame_date: string;
  updated_at: string;
  active: boolean;
}

// A profile can hold several lives at once — e.g. a Story game and a Sandbox
// (Wishgranter) game — and hop between them without losing either.
export default function LivesSwitcher({
  onClose,
  onNewLife,
}: {
  onClose: () => void;
  onNewLife: () => void;
}) {
  const [lives, setLives] = useState<Life[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/lives");
    const data = await res.json().catch(() => ({ lives: [] }));
    setLives(data.lives ?? []);
  }
  useEffect(() => {
    void load();
  }, []);

  async function switchTo(id: string) {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/lives", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "switch", id }),
    });
    if (res.ok) window.location.reload();
    else setBusy(false);
  }

  async function retire(life: Life) {
    if (busy) return;
    if (
      !window.confirm(
        `Retire ${life.char_name}? This life gets archived (recoverable) and leaves your list. You'll keep playing your current one.`,
      )
    )
      return;
    setBusy(true);
    const res = await fetch("/api/lives", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "archive", id: life.id }),
    });
    setBusy(false);
    if (res.ok) await load();
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-void-900/90 p-5 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-void-700 bg-void-800 p-6 shadow-card">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">Your lives</p>
            <h2 className="mt-1 font-serif text-xl font-medium">Switch life</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-lg p-1.5 text-dim transition-colors duration-200 hover:text-parchment"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        {lives === null ? (
          <p className="py-8 text-center font-mono text-xs uppercase tracking-widest text-dim">
            Loading…
          </p>
        ) : (
          <div className="grid gap-2.5">
            {lives.map((life) => (
              <div
                key={life.id}
                className={`rounded-xl border p-4 transition-colors duration-200 ${
                  life.active
                    ? "border-neon/60 bg-void-700/40"
                    : "border-void-700 bg-void-900/40"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-serif text-lg font-medium">{life.char_name}</span>
                  <span
                    className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                      life.mode === "sandbox"
                        ? "border-jade/50 text-jade"
                        : "border-void-700 text-dim"
                    }`}
                  >
                    {life.mode === "sandbox" ? "Wishgranter" : "Story"}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[11px] text-dim">
                  {life.arc_name} · age {life.age} · {life.ingame_date}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  {life.active ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-neon">
                      ● Playing now
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => void switchTo(life.id)}
                        disabled={busy}
                        className="cursor-pointer rounded-lg bg-neon px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-ink transition-all duration-200 hover:brightness-110 disabled:opacity-40"
                      >
                        Play this
                      </button>
                      <button
                        onClick={() => void retire(life)}
                        disabled={busy}
                        className="ml-auto cursor-pointer font-mono text-[10px] uppercase tracking-wider text-faint transition-colors duration-200 hover:text-chili disabled:opacity-40"
                      >
                        Retire
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}

            <button
              onClick={onNewLife}
              className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-void-700 px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-dim transition-colors duration-200 hover:border-neon/50 hover:text-neon"
            >
              + Start a new life
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
