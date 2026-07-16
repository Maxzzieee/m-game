import assert from "node:assert/strict";
import test from "node:test";
import { d100, rollCheck } from "../dice";
import type { Game } from "../types";

// The dice are the heart of the game — if they drift, the whole thing is a lie.

const game = (over: Partial<Game> = {}): Game =>
  ({
    brains: 1,
    face: 1,
    brawn: 1,
    guts: 2,
    mental_state: "Fresh",
    ...over,
  }) as Game;

test("a normal roll applies stat + mental-state modifiers correctly", () => {
  const r = rollCheck(game({ guts: 3, mental_state: "Stress" }), "GUTS", 12, "normal", [10]);
  assert.equal(r.d20, 10);
  assert.equal(r.statMod, 3);
  assert.equal(r.stateMod, -2); // Stress
  assert.equal(r.total, 11); // 10 + 3 - 2
  assert.equal(r.outcome, "fail"); // 11 < DC 12
  assert.equal(r.margin, -1);
  assert.equal(r.d20b, null);
});

test("[On Fire] grants +2 and Burnt Out costs -3", () => {
  assert.equal(rollCheck(game({ mental_state: "On Fire" }), "GUTS", 10, "normal", [10]).stateMod, 2);
  assert.equal(rollCheck(game({ mental_state: "Burnt Out" }), "GUTS", 10, "normal", [10]).stateMod, -3);
  assert.equal(rollCheck(game({ mental_state: "Fresh" }), "GUTS", 10, "normal", [10]).stateMod, 0);
});

test("advantage keeps the higher die, disadvantage the lower", () => {
  const adv = rollCheck(game(), "GUTS", 10, "advantage", [3, 17]);
  assert.equal(adv.d20, 17);
  assert.equal(adv.d20b, 3);

  const dis = rollCheck(game(), "GUTS", 10, "disadvantage", [3, 17]);
  assert.equal(dis.d20, 3);
  assert.equal(dis.d20b, 17);
});

test("nat 1 / nat 20 are judged on the KEPT die, not the raw pair", () => {
  // advantage rescues a 1 -> not a catastrophe
  const rescued = rollCheck(game(), "GUTS", 10, "advantage", [1, 20]);
  assert.equal(rescued.outcome, "nat20");
  // disadvantage drags a 20 down -> not legendary
  const dragged = rollCheck(game(), "GUTS", 10, "disadvantage", [1, 20]);
  assert.equal(dragged.outcome, "nat1");
});

test("nat 20 beats the DC even when modifiers would fail it", () => {
  const r = rollCheck(game({ guts: -1, mental_state: "Burnt Out" }), "GUTS", 25, "normal", [20]);
  assert.equal(r.outcome, "nat20"); // 20 - 1 - 3 = 16 < 25, but a nat 20 is a nat 20
});

test("manual (physical) dice are clamped to 1..20 — no cheating past the sheet", () => {
  assert.equal(rollCheck(game(), "GUTS", 10, "normal", [999]).d20, 20);
  assert.equal(rollCheck(game(), "GUTS", 10, "normal", [-5]).d20, 1);
  assert.equal(rollCheck(game(), "GUTS", 10, "normal", [7.6]).d20, 8); // rounded
});

test("an unknown stat label falls back to GUTS rather than NaN-ing the total", () => {
  const r = rollCheck(game({ guts: 2 }), "VIBES", 10, "normal", [10]);
  assert.equal(r.statMod, 2);
  assert.ok(Number.isInteger(r.total));
});

test("the server d20 is fair and in range (10k rolls)", () => {
  const counts = new Map<number, number>();
  for (let i = 0; i < 10_000; i++) {
    const r = rollCheck(game(), "GUTS", 10);
    assert.ok(r.d20 >= 1 && r.d20 <= 20, `out of range: ${r.d20}`);
    counts.set(r.d20, (counts.get(r.d20) ?? 0) + 1);
  }
  assert.equal(counts.size, 20, "every face should appear over 10k rolls");
  // each face ~500; allow generous spread but catch a broken RNG
  for (const [face, n] of counts) {
    assert.ok(n > 350 && n < 650, `face ${face} appeared ${n} times — RNG skewed?`);
  }
});

test("advantage really is ~75% to beat a coin-flip DC, disadvantage ~25%", () => {
  const rate = (mode: "advantage" | "disadvantage") => {
    let wins = 0;
    const N = 8000;
    for (let i = 0; i < N; i++) {
      // stat 0, Fresh -> total === die; DC 11 means "11+ on the die"
      if (rollCheck(game({ guts: 0 }), "GUTS", 11, mode).total >= 11) wins++;
    }
    return wins / N;
  };
  const adv = rate("advantage");
  const dis = rate("disadvantage");
  assert.ok(Math.abs(adv - 0.75) < 0.03, `advantage win rate ${adv}, expected ~0.75`);
  assert.ok(Math.abs(dis - 0.25) < 0.03, `disadvantage win rate ${dis}, expected ~0.25`);
});

test("d100 stays in range", () => {
  for (let i = 0; i < 3000; i++) {
    const n = d100();
    assert.ok(n >= 1 && n <= 100);
  }
});
