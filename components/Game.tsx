"use client";

import { useCallback, useEffect, useState } from "react";
import Gate from "./Gate";
import Creation from "./Creation";
import Play from "./Play";
import WorkMode from "./WorkMode";
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
  const [creating, setCreating] = useState(false); // "new life" without archiving

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

  let content: React.ReactNode = null;
  if (creating) {
    // Non-destructive "new life": create another game while the existing ones
    // stay put (the newest becomes active). onCreated drops back into play.
    content = (
      <Creation
        onCreated={() => {
          setCreating(false);
          void loadState();
        }}
      />
    );
  } else if (phase === "loading") {
    content = (
      <main className="grid min-h-screen place-items-center">
        <div className="animate-pulse font-mono text-xs uppercase tracking-[0.35em] text-dim">
          Loading
        </div>
      </main>
    );
  } else if (phase === "gate") {
    content = <Gate onAuthed={loadState} />;
  } else if (phase === "creation") {
    content = <Creation onCreated={loadState} />;
  } else if (phase === "play" && snap?.game) {
    content = <Play initial={snap} reload={loadState} onNewLife={() => setCreating(true)} />;
  }

  // WorkMode is a fixed-position overlay + skin toggle; it sits above whatever
  // phase renders and is available on every screen.
  return (
    <>
      {content}
      <WorkMode />
    </>
  );
}
