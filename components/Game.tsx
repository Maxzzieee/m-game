"use client";

import { useCallback, useEffect, useState } from "react";
import Gate from "./Gate";
import Creation from "./Creation";
import Play from "./Play";
import type {
  ChoiceOption,
  Game as GameT,
  GameEvent,
  MoneyFlow,
  MoneyGoal,
  Npc,
  Pursuit,
} from "@/lib/types";
import type { AwaitingRoll } from "@/lib/turn";

export interface Snapshot {
  game: GameT | null;
  npcs: Npc[];
  transcript: GameEvent[];
  awaiting_roll: AwaitingRoll | null;
  pending_stat_boost?: boolean;
  choices?: ChoiceOption[] | null;
  scene_hook?: string | null;
  next_beat?: { label: string; date: string } | null;
  pursuit?: Pursuit | null;
  flows?: MoneyFlow[];
  goals?: MoneyGoal[];
}

type Phase = "loading" | "gate" | "creation" | "play";

export default function Game() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [snap, setSnap] = useState<Snapshot | null>(null);

  const loadState = useCallback(async () => {
    const res = await fetch("/api/state");
    if (res.status === 401) {
      setPhase("gate");
      return;
    }
    const data = (await res.json()) as Snapshot;
    setSnap(data);
    setPhase(data.game ? "play" : "creation");
  }, []);

  useEffect(() => {
    (async () => {
      const g = await fetch("/api/gate").then((r) => r.json());
      if (!g.authed) {
        setPhase("gate");
        return;
      }
      await loadState();
      // Fire-and-forget: let the offscreen world move if you've been away.
      void fetch("/api/worldsim", { method: "POST" }).catch(() => {});
    })();
  }, [loadState]);

  if (phase === "loading") {
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="animate-pulse font-mono text-xs uppercase tracking-[0.35em] text-dim">
          Loading
        </div>
      </main>
    );
  }

  if (phase === "gate") return <Gate onAuthed={loadState} />;
  if (phase === "creation") return <Creation onCreated={loadState} />;
  if (phase === "play" && snap?.game) return <Play initial={snap} reload={loadState} />;

  return null;
}
