"use client";

import { useState } from "react";
import PixelAvatar from "./PixelAvatar";
import Shop from "./Shop";
import LivesSwitcher from "./LivesSwitcher";
import type { Game, MoneyFlow, MoneyGoal, Npc, Pursuit } from "@/lib/types";

const PURSUIT_STAGE_NAMES = [
  "Spark",
  "First proof",
  "Gatekeeper clash",
  "The grind",
  "The threshold",
  "The life",
  "THE SUMMIT",
];

const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

const STAT_BAR: Record<string, string> = {
  Brains: "#1f6feb",
  Face: "#b83280",
  Brawn: "#c2410c",
  Guts: "#c8102e",
};

function Stat({ label, n }: { label: string; n: number }) {
  const pct = ((n + 1) / 6) * 100; // -1..5
  const c = STAT_BAR[label] ?? "#ce1126";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: c }}>
          {label}
        </span>
        <span className="font-mono text-sm text-parchment">{sign(n)}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-void-700/70">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(5, pct)}%`, backgroundColor: c }}
        />
      </div>
    </div>
  );
}

function Rep({ label, n }: { label: string; n: number }) {
  const half = (Math.abs(n) / 5) * 50;
  const tone = n > 0 ? "bg-jade" : "bg-chili";
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[4.2rem] font-mono text-[10px] uppercase tracking-wider text-dim">
        {label}
      </span>
      <div className="relative h-1.5 flex-1 rounded-full bg-void-700/70">
        <div className="absolute inset-y-0 left-1/2 w-px bg-parchment/20" aria-hidden />
        {n !== 0 && (
          <div
            className={`absolute inset-y-0 rounded-full ${tone} transition-all duration-500`}
            style={
              n > 0
                ? { left: "50%", width: `${half}%` }
                : { right: "50%", width: `${half}%` }
            }
          />
        )}
      </div>
      <span className="w-7 text-right font-mono text-xs text-parchment/90">{sign(n)}</span>
    </div>
  );
}

const MENTAL_TONE: Record<string, string> = {
  Fresh: "text-jade border-jade/40 bg-jade/5",
  Tired: "text-dim border-void-700 bg-void-700/30",
  Stress: "text-neon border-neon/40 bg-neon/5",
  "Burnt Out": "text-chili border-chili/50 bg-chili/5",
  "On Fire": "text-neon border-neon bg-neon/10 shadow-glow",
};

export default function CharacterSheet({
  game,
  npcs,
  pursuit,
  flows = [],
  goals = [],
  onRefresh,
  onNewLife,
}: {
  game: Game;
  npcs: Npc[];
  pursuit?: Pursuit | null;
  flows?: MoneyFlow[];
  goals?: MoneyGoal[];
  onRefresh?: () => Promise<void>;
  onNewLife?: () => void;
}) {
  const [shopOpen, setShopOpen] = useState(false);
  const [livesOpen, setLivesOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const net = flows.reduce((s, f) => s + (f.monthly || 0), 0);
  const activeGoals = goals.filter((g) => g.status === "active");

  return (
    <div className="space-y-7">
      <div className="flex items-start gap-4">
        <div className="shrink-0 rounded-xl border border-void-700 bg-void-900/60 p-2">
          <PixelAvatar game={game} size={88} />
        </div>
        <div className="min-w-0">
          <h2 className="font-serif text-2xl font-medium leading-tight">{game.char_name}</h2>
          <p className="mt-0.5 text-sm text-dim">
            Age {game.age} · Arc {game.arc}
          </p>
          <p className="mt-2 font-mono text-sm">
            <span className={game.money < 0 ? "text-chili" : "text-neon"}>${game.money}</span>
            {net !== 0 && (
              <span className={`ml-2 text-[11px] ${net > 0 ? "text-jade" : "text-chili"}`}>
                {net > 0 ? "+" : "−"}${Math.abs(net)}/mo
              </span>
            )}
          </p>
          <button
            onClick={() => setShopOpen(true)}
            className="mt-1.5 cursor-pointer rounded-lg border border-void-700 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-dim transition-colors duration-200 hover:border-neon/50 hover:text-neon"
          >
            Pasar malam
          </button>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 font-mono text-[11px] tracking-wider ${
              MENTAL_TONE[game.mental_state] ?? "border-void-700 text-dim"
            }`}
          >
            {game.mental_state}
            {game.mental_state === "On Fire" && ` · ${game.on_fire_checks} left`}
          </span>
          {game.confirm_chop && (
            <span className="rounded-full border border-neon/50 bg-neon/5 px-3 py-1 font-mono text-[11px] tracking-wider text-neon">
              CONFIRM PLUS CHOP
            </span>
          )}
          {game.heng > 0 && (
            <span
              className="rounded-full border border-chili/50 bg-chili/5 px-3 py-1 font-mono text-[11px] tracking-wider text-chili"
              title="Reroll tokens — spend one after a roll settles; second roll stands"
            >
              HENG ×{game.heng}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
        <Stat label="Brains" n={game.brains} />
        <Stat label="Face" n={game.face} />
        <Stat label="Brawn" n={game.brawn} />
        <Stat label="Guts" n={game.guts} />
      </div>

      {pursuit && (
        <div className="rounded-xl border border-neon/40 bg-neon/5 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">The dream</p>
          <p className="mt-1 font-serif text-lg font-medium leading-tight">{pursuit.dream}</p>
          <div className="mt-2.5 flex items-center gap-1.5" aria-hidden>
            {Array.from({ length: 7 }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${
                  i <= pursuit.stage ? (i === 6 ? "bg-chili" : "bg-neon") : "bg-void-700"
                }`}
              />
            ))}
          </div>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-neon">
            Stage {pursuit.stage}: {PURSUIT_STAGE_NAMES[Math.min(6, Math.max(0, pursuit.stage))]}
          </p>
          {pursuit.next_milestone && (
            <p className="mt-1.5 text-xs italic leading-snug text-dim">
              Next: {pursuit.next_milestone}
            </p>
          )}
        </div>
      )}

      {activeGoals.length > 0 && (
        <div className="space-y-2.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">Money goals</p>
          {activeGoals.map((g) => {
            const pct = Math.min(100, Math.round((g.saved / Math.max(1, g.target)) * 100));
            const overdue = g.deadline && g.deadline < game.ingame_date && g.saved < g.target;
            return (
              <div key={g.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px]">
                    {g.source === "world" && <span className="text-dim">◆ </span>}
                    {g.label}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-dim">
                    ${g.saved}/${g.target}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-void-700/70">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      overdue ? "bg-chili" : g.source === "world" ? "bg-neon" : "bg-jade"
                    }`}
                    style={{ width: `${Math.max(4, pct)}%` }}
                  />
                </div>
                {(g.deadline || overdue) && (
                  <p className={`mt-0.5 font-mono text-[9px] ${overdue ? "text-chili" : "text-faint"}`}>
                    {overdue ? "OVERDUE" : `by ${g.deadline}`}
                    {g.source === "world" && g.stakes ? ` · ${g.stakes}` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {flows.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">The ledger</p>
          {flows.map((f) => (
            <div key={f.id} className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="truncate text-parchment/85">{f.name}</span>
              <span className={`shrink-0 font-mono text-xs ${f.monthly >= 0 ? "text-jade" : "text-chili"}`}>
                {f.monthly >= 0 ? "+" : "−"}${Math.abs(f.monthly)}/mo
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">Reputation</p>
        <Rep label="Academic" n={game.rep_academic} />
        <Rep label="Social" n={game.rep_social} />
        <Rep label="Street" n={game.rep_street} />
        <Rep label="Family" n={game.rep_family} />
        <Rep label="System" n={game.rep_system} />
      </div>

      {npcs.length > 0 && (
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">The cast</p>
          {npcs.map((n) => (
            <div
              key={n.id}
              className="rounded-xl border border-void-700 bg-void-900/50 px-3.5 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-serif text-[15px] font-medium">{n.name}</span>
                <span className="font-mono text-[9px] uppercase tracking-widest text-dim">
                  {n.archetype.replace(/_/g, " ")}
                </span>
              </div>
              {n.hook && (
                <p className="mt-0.5 font-serif text-xs italic leading-snug text-dim">{n.hook}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="font-mono text-[10px] leading-relaxed text-faint">
        {game.ses_tier}
        <br />
        {game.looks_tier} · turn {game.turn_no}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <a
          href="/api/export"
          download
          className="cursor-pointer rounded-lg border border-void-700 px-3 py-2 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-faint transition-colors duration-200 hover:border-jade/50 hover:text-jade"
          title="Download this whole life as a JSON file"
        >
          Export life
        </a>
        <label
          className="cursor-pointer rounded-lg border border-void-700 px-3 py-2 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-faint transition-colors duration-200 hover:border-jade/50 hover:text-jade"
          title="Restore a life from an exported file"
        >
          {importing ? "Restoring…" : "Import life"}
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (!window.confirm("Restore this file? Your current life gets archived first.")) {
                e.target.value = "";
                return;
              }
              setImporting(true);
              const res = await fetch("/api/import", { method: "POST", body: await file.text() });
              setImporting(false);
              if (res.ok) window.location.reload();
              else {
                const { error } = await res.json().catch(() => ({ error: "import failed" }));
                window.alert(error);
              }
            }}
          />
        </label>
        <button
          onClick={() => setLivesOpen(true)}
          className="cursor-pointer rounded-lg border border-void-700 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-faint transition-colors duration-200 hover:border-neon/50 hover:text-neon"
        >
          Lives
        </button>
        <button
          onClick={async () => {
            await fetch("/api/logout", { method: "POST" });
            window.location.reload();
          }}
          className="cursor-pointer rounded-lg border border-void-700 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-faint transition-colors duration-200 hover:border-dim/60 hover:text-parchment/80"
        >
          Log out
        </button>
      </div>

      {shopOpen && (
        <Shop
          game={game}
          onClose={() => setShopOpen(false)}
          onBought={async () => {
            await onRefresh?.();
          }}
        />
      )}

      {livesOpen && (
        <LivesSwitcher
          onClose={() => setLivesOpen(false)}
          onNewLife={() => {
            setLivesOpen(false);
            onNewLife?.();
          }}
        />
      )}
    </div>
  );
}
