"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CharacterSheet from "./CharacterSheet";
import { DiceChip, RollPrompt } from "./Dice";
import { IconClose, IconSend, IconSheet, IconSpark } from "./Icons";
import type { DiceResult, Game, GameEvent, Npc } from "@/lib/types";
import type { AwaitingRoll } from "@/lib/turn";
import type { Snapshot } from "./Game";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Very light markdown: **bold** and *italic* only (the DM uses them for emphasis).
function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    else out.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Narration({ text, streaming }: { text: string; streaming?: boolean }) {
  const paras = text.split(/\n{2,}/).filter((p) => p.trim());
  return (
    <div className="prose-narration animate-fadeup">
      {paras.map((p, i) => (
        <p key={i} className={streaming && i === paras.length - 1 ? "blink" : ""}>
          {renderInline(p)}
        </p>
      ))}
    </div>
  );
}

function PlayerBubble({ text }: { text: string }) {
  return (
    <div className="animate-fadeup ml-auto max-w-[82%] rounded-2xl rounded-br-md border border-void-700 bg-void-800 px-4 py-3 text-[15px] leading-relaxed text-parchment/90 shadow-card">
      {text}
    </div>
  );
}

export default function Play({ initial }: { initial: Snapshot; reload: () => void }) {
  const [game, setGame] = useState<Game>(initial.game!);
  const [npcs, setNpcs] = useState<Npc[]>(initial.npcs);
  const [events, setEvents] = useState<GameEvent[]>(initial.transcript);
  const [awaiting, setAwaiting] = useState<AwaitingRoll | null>(initial.awaiting_roll);

  const [live, setLive] = useState<{ player?: string; dice?: DiceResult; dm?: string }>({});
  const [streaming, setStreaming] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [input, setInput] = useState("");
  const [useBig, setUseBig] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const refreshState = useCallback(async () => {
    const data = (await fetch("/api/state").then((r) => r.json())) as Snapshot;
    if (data.game) setGame(data.game);
    setNpcs(data.npcs ?? []);
    setEvents(data.transcript ?? []);
    setAwaiting(data.awaiting_roll ?? null);
  }, []);

  const streamTurn = useCallback(
    async (body: Record<string, unknown>, playerText?: string) => {
      setStreaming(true);
      setLive((l) => ({ ...l, player: playerText ?? l.player, dm: "" }));
      try {
        const res = await fetch("/api/turn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, big: useBig }),
        });
        if (!res.ok || !res.body) {
          setLive((l) => ({ ...l, dm: "*[the DM lost the plot — try again]*" }));
          setStreaming(false);
          return;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          setLive((l) => ({ ...l, dm: acc }));
        }
      } finally {
        await refreshState();
        setLive({});
        setStreaming(false);
        setUseBig(false);
      }
    },
    [refreshState, useBig],
  );

  // Auto-open the very first scene.
  useEffect(() => {
    if (!startedRef.current && events.length === 0 && !streaming) {
      startedRef.current = true;
      void streamTurn({ mode: "start" });
    }
  }, [events.length, streaming, streamTurn]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events, live, awaiting]);

  async function send() {
    const text = input.trim();
    if (!text || streaming || rolling) return;
    setInput("");
    await streamTurn({ mode: "action", action: text }, text);
  }

  async function roll() {
    if (rolling || streaming) return;
    setRolling(true);
    try {
      const { dice } = (await fetch("/api/roll", { method: "POST" }).then((r) => r.json())) as {
        dice: DiceResult;
      };
      setAwaiting(null);
      setLive((l) => ({ ...l, dice }));
      await sleep(850);
      setRolling(false);
      await streamTurn({ mode: "resolve" });
    } catch {
      setRolling(false);
    }
  }

  const busy = streaming || rolling;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl gap-8 px-4 py-5 lg:px-8">
      {/* Story column */}
      <section className="flex min-h-[calc(100vh-2.5rem)] max-w-3xl flex-1 flex-col">
        <header className="mb-5 flex items-center justify-between border-b border-void-700/70 pb-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">
              Arc {game.arc} · {game.arc_name}
            </p>
            <h1 className="mt-0.5 font-serif text-xl font-medium">{game.char_name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setUseBig((v) => !v)}
              title="Route the next beat through the big model (Opus)"
              aria-pressed={useBig}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[11px] tracking-wider transition-colors duration-200 ${
                useBig
                  ? "border-neon/70 bg-neon/10 text-neon"
                  : "border-void-700 text-dim hover:border-dim/50 hover:text-parchment/80"
              }`}
            >
              <IconSpark className="h-3.5 w-3.5" /> BIG BEAT
            </button>
            <button
              onClick={() => setSheetOpen(true)}
              aria-label="Open character sheet"
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-void-700 px-3 py-1.5 font-mono text-[11px] tracking-wider text-dim transition-colors duration-200 hover:border-dim/50 hover:text-parchment/80 lg:hidden"
            >
              <IconSheet className="h-3.5 w-3.5" /> SHEET
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto pb-2 pr-1">
          {events.map((e) => {
            if (e.role === "dm") return <Narration key={e.id} text={e.prose} />;
            if (e.dice) return <DiceChip key={e.id} dice={e.dice} />;
            return <PlayerBubble key={e.id} text={e.prose} />;
          })}

          {live.player && <PlayerBubble text={live.player} />}
          {live.dice && <DiceChip dice={live.dice} />}
          {live.dm !== undefined && live.dm !== "" && <Narration text={live.dm} streaming />}
          {streaming && live.dm === "" && (
            <p className="font-serif text-sm italic text-dim">
              <span className="blink">the world turns</span>
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Action bar */}
        <div className="mt-5 border-t border-void-700/70 pt-4">
          {awaiting ? (
            <RollPrompt awaiting={awaiting} rolling={rolling} onRoll={roll} />
          ) : (
            <div className="flex items-end gap-2.5">
              <label htmlFor="action" className="sr-only">
                What do you do?
              </label>
              <textarea
                id="action"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={2}
                disabled={busy}
                placeholder={busy ? "…" : "What do you do?"}
                className="max-h-44 flex-1 resize-none rounded-2xl border border-void-700 bg-void-800 px-4 py-3.5 text-[15px] leading-relaxed shadow-card outline-none transition-colors duration-200 placeholder:text-faint focus:border-neon/60 disabled:opacity-50"
              />
              <button
                onClick={send}
                disabled={busy || !input.trim()}
                aria-label="Act"
                className="flex h-[52px] cursor-pointer items-center gap-2 rounded-2xl bg-neon px-5 font-semibold text-ink transition-all duration-200 hover:brightness-110 disabled:cursor-default disabled:opacity-40"
              >
                <IconSend /> Act
              </button>
            </div>
          )}
          <p className="mt-2 hidden font-mono text-[10px] text-faint sm:block">
            ENTER to act · SHIFT+ENTER for a new line
          </p>
        </div>
      </section>

      {/* Sheet column (desktop) / drawer (mobile) */}
      <aside
        className={`${
          sheetOpen ? "fixed inset-0 z-30 overflow-y-auto bg-void-900/97 p-6 backdrop-blur-sm" : "hidden"
        } lg:static lg:z-auto lg:block lg:w-80 lg:shrink-0 lg:overflow-visible lg:bg-transparent lg:p-0 lg:backdrop-blur-none`}
      >
        {sheetOpen && (
          <button
            onClick={() => setSheetOpen(false)}
            aria-label="Close character sheet"
            className="mb-5 flex cursor-pointer items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-dim lg:hidden"
          >
            <IconClose className="h-4 w-4" /> Close
          </button>
        )}
        <div className="rounded-2xl border border-void-700 bg-void-800/50 p-6 shadow-card lg:sticky lg:top-5">
          <CharacterSheet game={game} npcs={npcs} onRefresh={refreshState} />
        </div>
      </aside>
    </main>
  );
}
