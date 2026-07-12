"use client";

import { useState } from "react";
import { SHOP_ITEMS } from "@/lib/shop";
import type { Game } from "@/lib/types";
import { IconClose } from "./Icons";

export default function Shop({
  game,
  onClose,
  onBought,
}: {
  game: Game;
  onClose: () => void;
  onBought: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function buy(id: string) {
    setBusy(id);
    setMsg("");
    const res = await fetch("/api/shop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ item: id }),
    });
    if (res.ok) {
      await onBought();
      setMsg("Bought!");
    } else {
      const { error } = await res.json().catch(() => ({ error: "cannot" }));
      setMsg(error);
    }
    setBusy(null);
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-void-900/90 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md animate-fadeup rounded-2xl border border-void-700 bg-void-800 p-6 shadow-card">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-serif text-2xl font-medium">Pasar Malam</h2>
          <button
            onClick={onClose}
            aria-label="Close shop"
            className="cursor-pointer rounded-lg p-1.5 text-dim transition-colors duration-200 hover:text-parchment"
          >
            <IconClose />
          </button>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-dim">
          Your pocket: <span className="text-neon">${game.money}</span>
        </p>

        <div className="mt-5 space-y-2.5">
          {SHOP_ITEMS.map((item) => {
            const owned = item.kind === "gear" && game.items.includes(item.id);
            const broke = game.money < item.price;
            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-void-700 bg-void-900/50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {item.name}{" "}
                    <span className="font-mono text-xs text-dim">
                      {item.kind === "consumable" ? "· consumable" : ""}
                    </span>
                  </p>
                  <p className="mt-0.5 font-serif text-xs italic leading-snug text-dim">
                    {item.blurb}
                  </p>
                </div>
                <button
                  onClick={() => buy(item.id)}
                  disabled={owned || broke || busy !== null}
                  className={`shrink-0 cursor-pointer rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors duration-200 disabled:cursor-default ${
                    owned
                      ? "border-jade/50 text-jade"
                      : broke
                        ? "border-void-700 text-faint"
                        : "border-neon/60 text-neon hover:bg-neon/10"
                  }`}
                >
                  {owned ? "OWNED" : busy === item.id ? "..." : `$${item.price}`}
                </button>
              </div>
            );
          })}
        </div>

        {msg && <p className="mt-4 text-center font-serif text-sm italic text-dim">{msg}</p>}
      </div>
    </div>
  );
}
