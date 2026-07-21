"use client";

import type { Moment, Scene } from "@/lib/types";

// The "you are here, now" anchor. Two looks:
//  • ordinary scene  → a quiet establishing line (place · time · weather)
//  • active Moment    → a framed set-piece banner ("Playing it out")
export default function SceneHeader({
  scene,
  moment,
  weather,
  festival,
  present = [],
}: {
  scene: Scene | null;
  moment?: Moment | null;
  weather?: string | null;
  festival?: string | null;
  present?: string[]; // NPCs currently in the scene
}) {
  const inMoment = !!moment?.active;
  const meta = [scene?.time_of_day, weather, festival].filter(Boolean) as string[];
  const withWho = present.length > 0 ? `with ${present.slice(0, 4).join(", ")}` : null;

  if (inMoment) {
    return (
      <div className="animate-fadeup mb-4 overflow-hidden rounded-2xl border border-neon/60 bg-neon/[0.06] shadow-glow">
        <div className="flex items-center gap-2.5 border-b border-neon/25 px-4 py-2">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-neon" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-neon">
            Playing it out
            {moment?.kind && moment.kind !== "scene" ? ` · ${moment.kind}` : ""}
          </span>
        </div>
        <div className="px-4 py-3">
          <p className="font-serif text-lg font-medium leading-tight">{moment?.title}</p>
          {(scene?.location || meta.length > 0) && (
            <p className="mt-1 font-mono text-[11px] text-dim">
              {[scene?.location, ...meta].filter(Boolean).join(" · ")}
            </p>
          )}
          {withWho && (
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-neon/70">
              {withWho}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!scene?.location && meta.length === 0) return null;

  return (
    <div className="animate-fadeup mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 border-neon/40 pl-3">
      {scene?.location && (
        <span className="font-serif text-[15px] font-medium text-parchment/90">
          {scene.location}
        </span>
      )}
      {meta.length > 0 && (
        <span className="font-mono text-[11px] uppercase tracking-wider text-dim">
          {meta.join(" · ")}
        </span>
      )}
      {withWho && (
        <span className="font-mono text-[10px] uppercase tracking-wider text-faint">{withWho}</span>
      )}
    </div>
  );
}
