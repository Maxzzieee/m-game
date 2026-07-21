"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CharacterSheet from "./CharacterSheet";
import { DiceChip, RollOverlay, RollPrompt } from "./Dice";
import { IconClose, IconSend, IconSheet } from "./Icons";
import { ambianceFor, diffGame, type Choice, type DeltaToast } from "@/lib/ui";
import { calendarAmbiance, sgCalendar } from "@/lib/calendar";
import { MARK_BOOKKEEPING, MARK_STATE, type InlineState } from "@/lib/protocol";
import type { DiceResult, Game, GameEvent, MoneyFlow, MoneyGoal, Npc, Pursuit } from "@/lib/types";
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

const TOAST_TONE: Record<DeltaToast["tone"], string> = {
  up: "border-jade/60 text-jade",
  down: "border-chili/60 text-chili",
  money: "border-neon/60 text-neon",
  state: "border-parchment/40 text-parchment",
};

const GROWTH_STATS = [
  { key: "brains", label: "Brains", color: "#1f6feb", blurb: "The mugging finally compounds." },
  { key: "face", label: "Face", color: "#b83280", blurb: "You learned how to be liked." },
  { key: "brawn", label: "Brawn", color: "#c2410c", blurb: "The body caught up." },
  { key: "guts", label: "Guts", color: "#c8102e", blurb: "Fear got smaller." },
] as const;

// Arc-transition ceremony: the years changed you. Pick how.
function GrowthModal({ game, onPicked }: { game: Game; onPicked: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-void-900/95 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md animate-fadeup rounded-2xl border border-void-700 bg-void-800 p-7 text-center shadow-card">
        <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-dim">
          Arc {game.arc} · {game.arc_name}
        </p>
        <h2 className="mt-2 font-serif text-3xl font-medium">You&apos;ve grown.</h2>
        <p className="mx-auto mt-3 max-w-[36ch] text-sm leading-relaxed text-dim">
          Time did what time does. Choose what the last chapter of your life actually
          taught you — one stat, permanently +1.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2.5">
          {GROWTH_STATS.map((s) => (
            <button
              key={s.key}
              disabled={busy || (game[s.key] as number) >= 5}
              onClick={async () => {
                setBusy(true);
                await fetch("/api/boost", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ stat: s.key }),
                });
                await onPicked();
              }}
              className="cursor-pointer rounded-xl border border-void-700 bg-void-900/50 p-3.5 text-left transition-colors duration-200 hover:bg-void-900 disabled:cursor-default disabled:opacity-40"
              style={{ borderColor: `${s.color}55` }}
            >
              <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: s.color }}>
                {s.label} +1
              </span>
              <p className="mt-1 text-xs leading-snug text-dim">{s.blurb}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Play({
  initial,
  onNewLife,
}: {
  initial: Snapshot;
  reload: () => void;
  onNewLife?: () => void;
}) {
  const [game, setGame] = useState<Game>(initial.game!);
  const [npcs, setNpcs] = useState<Npc[]>(initial.npcs);
  const [events, setEvents] = useState<GameEvent[]>(initial.transcript);
  const [awaiting, setAwaiting] = useState<AwaitingRoll | null>(initial.awaiting_roll);

  const [live, setLive] = useState<{ player?: string; dice?: DiceResult; dm?: string }>({});
  const [pendingBoost, setPendingBoost] = useState(!!initial.pending_stat_boost);
  const [structuredChoices, setStructuredChoices] = useState<Choice[] | null>(
    initial.choices ?? null,
  );
  const [sceneHook, setSceneHook] = useState<string | null>(initial.scene_hook ?? null);
  const [nextBeat, setNextBeat] = useState<{ label: string; date: string } | null>(
    initial.next_beat ?? null,
  );
  const [pursuit, setPursuit] = useState<Pursuit | null>(initial.pursuit ?? null);
  const [flows, setFlows] = useState<MoneyFlow[]>(initial.flows ?? []);
  const [goals, setGoals] = useState<MoneyGoal[]>(initial.goals ?? []);
  const [passTimeOpen, setPassTimeOpen] = useState(false);
  const [focusText, setFocusText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [bookkeeping, setBookkeeping] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [overlay, setOverlay] = useState<{
    open: boolean;
    dice: DiceResult | null;
    canReroll: boolean;
  }>({ open: false, dice: null, canReroll: false });
  const [toasts, setToasts] = useState<DeltaToast[]>([]);
  const [input, setInput] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);
  const rollGate = useRef(false);
  const acceptGate = useRef(false); // blocks double accept -> duplicate resolve turn
  const turnGate = useRef(false); // blocks overlapping turn submissions

  const refreshState = useCallback(async () => {
    const data = (await fetch("/api/state").then((r) => r.json())) as Snapshot;
    if (data.game) {
      setGame((prev) => {
        const fresh = data.game!;
        const d = diffGame(prev, fresh);
        if (d.length) {
          setToasts(d);
          if (toastTimer.current) clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(() => setToasts([]), 5000);
        }
        return fresh;
      });
    }
    setNpcs(data.npcs ?? []);
    setEvents(data.transcript ?? []);
    setAwaiting(data.awaiting_roll ?? null);
    setPendingBoost(!!data.pending_stat_boost);
    setStructuredChoices(data.choices ?? null);
    setSceneHook(data.scene_hook ?? null);
    setNextBeat(data.next_beat ?? null);
    setPursuit(data.pursuit ?? null);
    setFlows(data.flows ?? []);
    setGoals(data.goals ?? []);
  }, []);

  // Apply the state payload inlined at the end of the turn stream — choices and
  // sheet update the instant the DM finishes, no extra round trip.
  const applyInline = useCallback((s: InlineState) => {
    setGame((prev) => {
      const d = diffGame(prev, s.game);
      if (d.length) {
        setToasts(d);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToasts([]), 5000);
      }
      return s.game;
    });
    setAwaiting(s.awaiting_roll ?? null);
    setStructuredChoices(s.choices ?? null);
    setNextBeat(s.next_beat ?? null);
    setSceneHook(s.scene_hook ?? null);
    setPursuit(s.pursuit ?? null);
    setFlows(s.flows ?? []);
    setGoals(s.goals ?? []);
  }, []);

  const streamTurn = useCallback(
    async (body: Record<string, unknown>, playerText?: string) => {
      // Synchronous double-submit gate. `streaming` is React state and lags a
      // frame, so two fast Enter/taps could both pass its check and POST twice —
      // recording the same action twice and making the DM think you repeated
      // yourself. This ref blocks the second call in the same tick.
      if (turnGate.current) return;
      turnGate.current = true;
      setStreaming(true);
      setBookkeeping(false);
      setLive((l) => ({ ...l, player: playerText ?? l.player, dm: "" }));
      let gotInline = false;
      try {
        const res = await fetch("/api/turn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok || !res.body) {
          setLive((l) => ({ ...l, dm: "*[the DM lost the plot — try again]*" }));
          setStreaming(false);
          return;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let acc = "";
        let stateBuf: string | null = null;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          let chunk = dec.decode(value, { stream: true });

          if (stateBuf !== null) {
            stateBuf += chunk;
            continue;
          }
          const stateIdx = chunk.indexOf(MARK_STATE);
          if (stateIdx >= 0) {
            stateBuf = chunk.slice(stateIdx + 1);
            chunk = chunk.slice(0, stateIdx);
          }
          const bkIdx = chunk.indexOf(MARK_BOOKKEEPING);
          if (bkIdx >= 0) {
            setBookkeeping(true);
            chunk = chunk.replace(MARK_BOOKKEEPING, "");
          }
          if (chunk) {
            acc += chunk;
            setLive((l) => ({ ...l, dm: acc }));
          }
        }
        if (stateBuf) {
          try {
            applyInline(JSON.parse(stateBuf) as InlineState);
            gotInline = true;
          } catch {
            // fall through to refreshState
          }
        }
      } finally {
        if (gotInline) {
          // Zero extra latency: append the scene to the transcript locally
          // (identical content to the server rows; real ids arrive on the next
          // full state fetch) and unlock immediately.
          const l = liveRef.current;
          const stamp = Date.now();
          setEvents((prev) => {
            const synth: GameEvent[] = [];
            if (l.player) {
              synth.push({
                id: `local-p-${stamp}`,
                role: "player",
                prose: l.player,
                dice: l.dice ?? null,
                tags: [],
              } as unknown as GameEvent);
            } else if (l.dice) {
              synth.push({
                id: `local-r-${stamp}`,
                role: "player",
                prose: "",
                dice: l.dice,
                tags: [],
              } as unknown as GameEvent);
            }
            if (l.dm) {
              synth.push({
                id: `local-d-${stamp}`,
                role: "dm",
                prose: l.dm,
                dice: null,
                tags: [],
              } as unknown as GameEvent);
            }
            return [...prev, ...synth];
          });
          setLive({});
        } else {
          await refreshState();
          setLive({});
        }
        setBookkeeping(false);
        setStreaming(false);
        turnGate.current = false;
      }
    },
    [refreshState, applyInline],
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

  async function send(text?: string) {
    const action = (text ?? input).trim();
    if (!action || streaming || rolling) return;
    setInput("");
    await streamTurn({ mode: "action", action }, action);
  }

  async function passTime(span: "weeks" | "months" | "beat") {
    if (streaming || rolling) return;
    const focus = focusText.trim();
    setPassTimeOpen(false);
    setFocusText("");
    const label =
      span === "beat"
        ? `until ${nextBeat?.label ?? "the next beat"}`
        : span === "months"
          ? "a few months"
          : "a few weeks";
    await streamTurn(
      { mode: "montage", span, focus: focus || undefined },
      `⏩ Time passes — ${label}${focus ? ` (${focus})` : ""}`,
    );
  }

  const isWin = (o: DiceResult["outcome"]) => o === "success" || o === "nat20";

  // Accept the settled roll: close the overlay and stream the consequence.
  async function acceptRoll(dice: DiceResult) {
    if (acceptGate.current) return;
    acceptGate.current = true;
    setOverlay({ open: false, dice: null, canReroll: false });
    setLive((l) => ({ ...l, dice }));
    setRolling(false);
    await streamTurn({ mode: "resolve" });
    acceptGate.current = false;
  }

  // Abort a stuck/failed roll: close the overlay and resync with the server.
  async function cancelRoll() {
    setOverlay({ open: false, dice: null, canReroll: false });
    setRolling(false);
    await refreshState();
  }

  // Settle a landed roll into the overlay. A WIN locks in and auto-accepts —
  // there is no button to click into a worse result. A failure offers the
  // heng reroll (only if tokens remain and only once).
  async function settleRoll(dice: DiceResult, quick: boolean) {
    await sleep(quick ? 350 : 650);
    if (isWin(dice.outcome)) {
      setOverlay({ open: true, dice, canReroll: false }); // no reroll on a win
      await sleep(1100); // let the win land, then lock it in automatically
      await acceptRoll(dice);
    } else {
      // Failure: let the player accept it or spend heng to reroll (once).
      setOverlay({ open: true, dice, canReroll: game.heng > 0 });
    }
  }

  // manual = physical dice the player rolled IRL ([n] or [n, n] for adv/dis)
  async function roll(manual?: number[]) {
    if (rollGate.current || streaming) return;
    rollGate.current = true; // synchronous double-tap guard (state lags a frame)
    setRolling(true);
    setOverlay({ open: true, dice: null, canReroll: false });
    try {
      const res = await fetch("/api/roll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(manual?.length ? { manual } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as { dice?: DiceResult };
      if (!res.ok || !data.dice) {
        await cancelRoll();
        return;
      }
      setAwaiting(null);
      await settleRoll(data.dice, !!manual?.length);
    } catch {
      await cancelRoll();
    } finally {
      rollGate.current = false;
    }
  }

  // Burn a heng token: reroll the same check. The second roll stands — but if it
  // WINS, it locks in (no clicking into a worse result). Gated so a laggy
  // connection + mashing can't fire multiple rerolls and burn extra tokens.
  async function rerollHeng(manual?: number[]) {
    if (rollGate.current) return;
    rollGate.current = true;
    setOverlay((o) => ({ ...o, canReroll: false })); // hide the button instantly
    setRolling(true);
    setOverlay({ open: true, dice: null, canReroll: false });
    try {
      const res = await fetch("/api/reroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(manual?.length ? { manual } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        dice?: DiceResult;
        heng?: number;
      };
      if (!res.ok || !data.dice) {
        await cancelRoll();
        return;
      }
      // Trust the server's post-state heng: it's unchanged if the reroll was
      // refused for an already-won roll, decremented on a real reroll.
      setGame((g) => ({ ...g, heng: data.heng ?? Math.max(0, g.heng - 1) }));
      // A reroll never offers another reroll (one per check) — settleRoll will
      // auto-accept a win and only let a failure be accepted.
      await settleRollNoReroll(data.dice, !!manual?.length);
    } catch {
      await cancelRoll();
    } finally {
      rollGate.current = false;
    }
  }

  // Like settleRoll but never offers a further reroll (heng is one-shot).
  async function settleRollNoReroll(dice: DiceResult, quick: boolean) {
    await sleep(quick ? 350 : 650);
    setOverlay({ open: true, dice, canReroll: false });
    if (isWin(dice.outcome)) {
      await sleep(1100);
      await acceptRoll(dice);
    }
  }

  const busy = streaming || rolling;

  // Choices come only from the DM's structured tool output. (The old regex
  // prose-scraper is gone: it could only ever resurface stale options.)
  const lastDm = [...events].reverse().find((e) => e.role === "dm");
  const choices: Choice[] =
    busy || awaiting || !Array.isArray(structuredChoices) ? [] : structuredChoices;

  // Scene ambiance: tags first, then the calendar's season/festival tint.
  const ambiance =
    ambianceFor(lastDm?.tags, game) ?? calendarAmbiance(game.ingame_date) ?? "rgba(220, 150, 46, 0.08)";
  const cal = sgCalendar(game.ingame_date, game.age);

  return (
    <main className="relative mx-auto flex min-h-screen max-w-6xl gap-8 px-4 py-5 lg:px-8">
      {/* scene ambiance wash */}
      <div
        aria-hidden
        className="wm-ambiance pointer-events-none fixed inset-0 transition-[background] duration-[1500ms]"
        style={{ background: `radial-gradient(900px 600px at 50% 0%, ${ambiance}, transparent 75%)` }}
      />

      {overlay.open && (
        <RollOverlay
          dice={overlay.dice}
          hengLeft={game.heng}
          canReroll={overlay.canReroll}
          onAccept={overlay.dice ? () => void acceptRoll(overlay.dice!) : undefined}
          onReroll={overlay.canReroll ? (manual) => void rerollHeng(manual) : undefined}
          onCancel={() => void cancelRoll()}
        />
      )}

      {pendingBoost && !streaming && game.mode !== "sandbox" && (
        <GrowthModal game={game} onPicked={refreshState} />
      )}

      {/* consequence toasts */}
      {toasts.length > 0 && (
        <div className="fixed left-1/2 top-5 z-40 flex -translate-x-1/2 flex-wrap justify-center gap-2 px-4">
          {toasts.map((t) => (
            <span
              key={t.id}
              className={`animate-fadeup rounded-full border bg-void-800/95 px-3.5 py-1.5 font-mono text-xs shadow-card ${TOAST_TONE[t.tone]}`}
            >
              {t.text}
            </span>
          ))}
        </div>
      )}

      {/* Story column */}
      <section className="relative flex min-h-[calc(100vh-2.5rem)] max-w-3xl flex-1 flex-col">
        <header className="mb-5 flex items-center justify-between border-b border-void-700/70 pb-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">
              Arc {game.arc} · {game.arc_name} · {cal.shortLabel}
            </p>
            <h1 className="mt-0.5 font-serif text-xl font-medium">{game.char_name}</h1>
            {nextBeat && (
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neon/80">
                Next: {nextBeat.label} · {nextBeat.date}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
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
          {live.dm !== undefined && live.dm !== "" && (
            <Narration text={live.dm} streaming={!bookkeeping} />
          )}
          {streaming && live.dm === "" && (
            <p className="font-serif text-sm italic text-dim">
              <span className="blink">the world turns</span>
            </p>
          )}
          {/* prose done, choices being written — bridge the gap */}
          {bookkeeping && (
            <div className="grid gap-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-11 animate-pulse rounded-xl border border-void-700 bg-void-800/60"
                  style={{ animationDelay: `${i * 150}ms`, width: `${88 - i * 9}%` }}
                />
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Action bar */}
        <div className="mt-5 border-t border-void-700/70 pt-4">
          {/* NPC-initiated scene: the world knocks */}
          {sceneHook && !busy && !awaiting && (
            <button
              onClick={async () => {
                setSceneHook(null);
                await streamTurn({ mode: "nudge" });
              }}
              className="animate-pulseglow mb-3 flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-neon/50 bg-void-800 px-4 py-3 text-left shadow-card transition-colors duration-200 hover:bg-void-800/70"
            >
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-neon" />
              </span>
              <span className="min-w-0">
                <span className="block font-mono text-[10px] uppercase tracking-[0.3em] text-dim">
                  Something&apos;s happening
                </span>
                <span className="block truncate text-sm text-parchment/90">{sceneHook}</span>
              </span>
              <span className="ml-auto shrink-0 font-mono text-[11px] uppercase tracking-wider text-neon">
                See →
              </span>
            </button>
          )}
          {awaiting ? (
            <div className="space-y-3">
              <RollPrompt
                awaiting={awaiting}
                rolling={rolling}
                onRoll={() => void roll()}
                onManual={(vals) => void roll(vals)}
              />
              {/* escape hatch: a pending check never removes your agency */}
              <div className="flex items-end gap-2.5">
                <label htmlFor="action-alt" className="sr-only">
                  Do something else instead
                </label>
                <textarea
                  id="action-alt"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  disabled={busy}
                  placeholder="…or back out and do something else instead"
                  className="max-h-32 flex-1 resize-none rounded-xl border border-void-700 bg-void-800 px-3.5 py-2.5 text-sm leading-relaxed shadow-card outline-none transition-colors duration-200 placeholder:text-faint focus:border-neon/60 disabled:opacity-50"
                />
                <button
                  onClick={() => void send()}
                  disabled={busy || !input.trim()}
                  aria-label="Do something else"
                  className="cursor-pointer rounded-xl border border-void-700 px-4 py-2.5 text-sm font-semibold text-dim transition-colors duration-200 hover:border-neon/50 hover:text-neon disabled:cursor-default disabled:opacity-40"
                >
                  Act
                </button>
              </div>
            </div>
          ) : (
            <div>
              {choices.length > 0 && (
                <div className="wm-choices mb-3 grid gap-2">
                  {choices.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => void send(c.label)}
                      className="wm-choice group flex w-full cursor-pointer items-start gap-3 rounded-xl border border-void-700 bg-void-800/80 px-4 py-3 text-left shadow-card transition-all duration-200 hover:border-neon/60 hover:bg-void-800"
                    >
                      <span className="wm-choice-key mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-neon/40 font-mono text-xs font-medium text-neon transition-colors duration-200 group-hover:bg-neon group-hover:text-ink">
                        {c.key}
                      </span>
                      <span className="text-[15px] leading-snug text-parchment/90 group-hover:text-parchment">
                        {c.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}
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
                  placeholder={busy ? "…" : "Or write your own move…"}
                  className="max-h-44 flex-1 resize-none rounded-2xl border border-void-700 bg-void-800 px-4 py-3.5 text-[15px] leading-relaxed shadow-card outline-none transition-colors duration-200 placeholder:text-faint focus:border-neon/60 disabled:opacity-50"
                />
                <button
                  onClick={() => void send()}
                  disabled={busy || !input.trim()}
                  aria-label="Act"
                  className="flex h-[52px] cursor-pointer items-center gap-2 rounded-2xl bg-neon px-5 font-semibold text-ink transition-all duration-200 hover:brightness-110 disabled:cursor-default disabled:opacity-40"
                >
                  <IconSend /> Act
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="hidden font-mono text-[10px] text-faint sm:block">
                  ENTER to act · SHIFT+ENTER for a new line
                </p>
                <button
                  onClick={() => setPassTimeOpen((v) => !v)}
                  disabled={busy}
                  aria-expanded={passTimeOpen}
                  className={`ml-auto cursor-pointer rounded-lg border px-3 py-1.5 font-mono text-[11px] tracking-wider transition-colors duration-200 disabled:cursor-default disabled:opacity-40 ${
                    passTimeOpen
                      ? "border-neon/60 text-neon"
                      : "border-void-700 text-dim hover:border-dim/50 hover:text-parchment/80"
                  }`}
                >
                  ⏩ PASS TIME
                </button>
              </div>

              {passTimeOpen && (
                <div className="animate-fadeup mt-3 rounded-2xl border border-void-700 bg-void-800 p-4 shadow-card">
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">
                    Let the weeks fold — the world may interrupt
                  </p>
                  <input
                    value={focusText}
                    onChange={(e) => setFocusText(e.target.value)}
                    placeholder="spend the time doing… (optional)"
                    className="mt-3 w-full rounded-xl border border-void-700 bg-void-900/50 px-3.5 py-2.5 text-sm outline-none transition-colors duration-200 placeholder:text-faint focus:border-neon/60"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => void passTime("weeks")}
                      className="cursor-pointer rounded-lg border border-void-700 px-3.5 py-2 text-sm text-parchment/85 transition-colors duration-200 hover:border-neon/50 hover:text-neon"
                    >
                      A few weeks
                    </button>
                    <button
                      onClick={() => void passTime("months")}
                      className="cursor-pointer rounded-lg border border-void-700 px-3.5 py-2 text-sm text-parchment/85 transition-colors duration-200 hover:border-neon/50 hover:text-neon"
                    >
                      A few months
                    </button>
                    {nextBeat && (
                      <button
                        onClick={() => void passTime("beat")}
                        className="cursor-pointer rounded-lg border border-neon/50 bg-neon/5 px-3.5 py-2 text-sm text-neon transition-colors duration-200 hover:bg-neon/10"
                      >
                        Until: {nextBeat.label}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
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
          <CharacterSheet
            game={game}
            npcs={npcs}
            pursuit={pursuit}
            flows={flows}
            goals={goals}
            onRefresh={refreshState}
            onNewLife={onNewLife}
          />
        </div>
      </aside>
    </main>
  );
}
