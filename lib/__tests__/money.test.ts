import assert from "node:assert/strict";
import test from "node:test";
import { monthsBetween, netMonthly, overdueGoals } from "../money";
import type { MoneyFlow, MoneyGoal } from "../types";

const flow = (monthly: number, status: "active" | "ended" = "active"): MoneyFlow =>
  ({ monthly, status }) as MoneyFlow;

test("monthsBetween counts across months and years, floors at malformed", () => {
  assert.equal(monthsBetween("2016-01", "2016-01"), 0);
  assert.equal(monthsBetween("2016-01", "2016-04"), 3);
  assert.equal(monthsBetween("2016-11", "2017-02"), 3); // across a year boundary
  assert.equal(monthsBetween("2016-06", "2019-06"), 36);
  assert.equal(monthsBetween("2016-06", "2016-05"), -1); // backwards (caller clamps)
  assert.equal(monthsBetween("junk", "2016-05"), 0);
});

test("netMonthly sums only active flows, signed", () => {
  assert.equal(netMonthly([flow(480), flow(150), flow(-40), flow(-200)]), 390);
  assert.equal(netMonthly([flow(480), flow(300, "ended")]), 480); // ended excluded
  assert.equal(netMonthly([]), 0);
  assert.equal(netMonthly([flow(-40), flow(-200)]), -240); // pure expenses → negative
});

test("accrual math: net × clamped months (the montage payout)", () => {
  const net = netMonthly([flow(480), flow(-40)]); // 440/mo
  const months = (a: string, b: string) => Math.max(0, Math.min(12, monthsBetween(a, b)));
  assert.equal(net * months("2016-01", "2016-04"), 1320); // 3 months
  assert.equal(net * months("2016-01", "2016-01"), 0); // same month, no pay
  assert.equal(net * months("2016-01", "2020-01"), 440 * 12); // capped at 12 months
});

const goal = (over: Partial<MoneyGoal>): MoneyGoal =>
  ({
    label: "x",
    target: 100,
    saved: 0,
    deadline: null,
    source: "world",
    status: "active",
    ...over,
  }) as MoneyGoal;

test("overdueGoals: active world goals past deadline and short of target", () => {
  const goals = [
    goal({ label: "rent", deadline: "2016-03", saved: 200, target: 800 }), // overdue
    goal({ label: "met-in-time", deadline: "2016-03", saved: 800, target: 800 }), // funded → not overdue
    goal({ label: "future", deadline: "2016-12", saved: 0, target: 500 }), // not due yet
    goal({ label: "no-deadline", deadline: null, saved: 0, target: 500 }), // no deadline
  ];
  const od = overdueGoals(goals, "2016-06").map((g) => g.label);
  assert.deepEqual(od, ["rent"]);
});
