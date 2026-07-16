import assert from "node:assert/strict";
import test from "node:test";
import { calendarAmbiance, sgCalendar } from "../calendar";
import { looksTier, sesTier, STEREOTYPES, STEREOTYPE_ORDER } from "../constants";
import { improveMentalState, shopItem, SHOP_ITEMS } from "../shop";
import { parseChoices } from "../ui";

// Pure-logic guards. These are the invariants that must never silently drift:
// stat budgets, dice fairness, tier boundaries, sanitizer strictness.

test("every preset archetype costs the same +4 stat budget", () => {
  for (const name of STEREOTYPE_ORDER) {
    const s = STEREOTYPES[name];
    const sum = s.brains + s.face + s.brawn + s.guts;
    assert.equal(sum, 4, `${name} sums to ${sum}, expected 4`);
    for (const [k, v] of Object.entries(s)) {
      if (typeof v !== "number") continue;
      assert.ok(v >= -1 && v <= 3, `${name}.${k} = ${v} out of -1..3`);
    }
  }
});

test("SES / looks tiers cover 1..100 with no gaps", () => {
  for (let roll = 1; roll <= 100; roll++) {
    assert.ok(sesTier(roll).length > 0, `ses gap at ${roll}`);
    assert.ok(looksTier(roll).length > 0, `looks gap at ${roll}`);
  }
  assert.equal(sesTier(1), sesTier(15));
  assert.notEqual(sesTier(15), sesTier(16)); // boundary must flip
  assert.notEqual(looksTier(90), looksTier(91));
});

test("calendar derives a line for every month of the run (2016-2033)", () => {
  for (let y = 2016; y <= 2033; y++) {
    for (let m = 1; m <= 12; m++) {
      const date = `${y}-${String(m).padStart(2, "0")}`;
      const cal = sgCalendar(date, 13);
      assert.equal(cal.year, y);
      assert.equal(cal.month, m);
      assert.ok(cal.line.includes(String(y)), `line missing year for ${date}`);
      assert.ok(cal.shortLabel.length > 0);
    }
  }
});

test("calendar survives a malformed date instead of crashing the turn", () => {
  const cal = sgCalendar("not-a-date", 13);
  assert.equal(cal.year, 2016);
  assert.equal(cal.month, 1);
  assert.equal(calendarAmbiance("junk"), null);
});

test("exam-year pressure lands on the right ages", () => {
  assert.ok(sgCalendar("2019-10", 16).examYear?.includes("O/N-LEVELS"));
  assert.ok(sgCalendar("2015-10", 12).examYear?.includes("PSLE"));
  assert.equal(sgCalendar("2017-10", 14).examYear, null);
});

test("consumables step mental state toward Fresh but never past it", () => {
  assert.equal(improveMentalState("Burnt Out"), "Stress");
  assert.equal(improveMentalState("Stress"), "Tired");
  assert.equal(improveMentalState("Tired"), "Fresh");
  assert.equal(improveMentalState("Fresh"), "Fresh");
  // On Fire is earned, never bought — must be untouchable
  assert.equal(improveMentalState("On Fire"), "On Fire");
});

test("shop catalog is coherent (unique ids, positive prices, known kinds)", () => {
  const ids = new Set<string>();
  for (const item of SHOP_ITEMS) {
    assert.ok(!ids.has(item.id), `duplicate shop id ${item.id}`);
    ids.add(item.id);
    assert.ok(item.price > 0, `${item.id} price must be positive`);
    assert.ok(["gear", "consumable"].includes(item.kind));
    assert.equal(shopItem(item.id)?.id, item.id);
  }
  assert.equal(shopItem("does-not-exist"), null);
});

test("parseChoices needs a real menu (guards the old white-screen class of bug)", () => {
  assert.deepEqual(parseChoices("Just prose, no menu here at all."), []);
  assert.deepEqual(parseChoices("A) only one option"), []); // needs >= 2
  const two = parseChoices("A) Go left\nB) Go right");
  assert.equal(two.length, 2);
  assert.equal(two[0].key, "A");
  assert.equal(two[1].label, "Go right");
});
