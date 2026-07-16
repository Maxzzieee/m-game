import { db } from "./supabase";
import type { FlowKind, Game, MoneyFlow, MoneyGoal, TurnDelta } from "./types";

// The money system. Recurring flows (jobs, hustles, businesses, expenses) net
// out and accrue to the balance as in-game time passes; goals give the hustling
// a reason. Pure helpers here are unit-tested; the DB ops mutate Postgres.

const clampInt = (n: unknown, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0));

// ---- pure helpers (tested) --------------------------------------------------

export function monthsBetween(a: string, b: string): number {
  const pa = a.match(/^(\d{4})-(\d{2})$/);
  const pb = b.match(/^(\d{4})-(\d{2})$/);
  if (!pa || !pb) return 0;
  return (+pb[1] - +pa[1]) * 12 + (+pb[2] - +pa[2]);
}

export function netMonthly(flows: Pick<MoneyFlow, "monthly" | "status">[]): number {
  return flows
    .filter((f) => f.status === "active")
    .reduce((sum, f) => sum + (f.monthly || 0), 0);
}

export function overdueGoals(goals: MoneyGoal[], date: string): MoneyGoal[] {
  return goals.filter(
    (g) => g.status === "active" && g.deadline && g.deadline < date && g.saved < g.target,
  );
}

const FLOW_KINDS: FlowKind[] = ["job", "hustle", "business", "investment", "expense"];

// Keep model output in a sane band so a hallucinated $9,999,999 salary can't warp a save.
const MONTHLY_CAP = 100_000;

// ---- DB ops -----------------------------------------------------------------

export async function getFlows(gameId: string): Promise<MoneyFlow[]> {
  const { data } = await db()
    .from("money_flows")
    .select("*")
    .eq("game_id", gameId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  return (data as MoneyFlow[]) ?? [];
}

export async function getGoals(gameId: string): Promise<MoneyGoal[]> {
  const { data } = await db()
    .from("money_goals")
    .select("*")
    .eq("game_id", gameId)
    .neq("status", "abandoned")
    .order("created_at", { ascending: true });
  return (data as MoneyGoal[]) ?? [];
}

export async function applyFlowOps(
  gameId: string,
  arc: number,
  ops: NonNullable<TurnDelta["ledger"]>,
): Promise<void> {
  for (const op of ops) {
    if (!op?.name || typeof op.name !== "string") continue;
    if (op.action === "add") {
      const kind = FLOW_KINDS.includes(op.kind as FlowKind) ? op.kind : "hustle";
      await db().from("money_flows").insert({
        game_id: gameId,
        kind,
        name: op.name.slice(0, 80),
        monthly: clampInt(op.monthly, -MONTHLY_CAP, MONTHLY_CAP),
        note: op.note ?? null,
      });
      continue;
    }
    // update / end target an existing active flow by name
    const { data: existing } = await db()
      .from("money_flows")
      .select("*")
      .eq("game_id", gameId)
      .eq("status", "active")
      .ilike("name", op.name)
      .maybeSingle();
    if (!existing) continue;
    if (op.action === "end") {
      await db().from("money_flows").update({ status: "ended" }).eq("id", existing.id);
    } else if (op.action === "update") {
      const patch: Record<string, unknown> = {};
      if (typeof op.monthly === "number")
        patch.monthly = clampInt(op.monthly, -MONTHLY_CAP, MONTHLY_CAP);
      if (op.kind && FLOW_KINDS.includes(op.kind)) patch.kind = op.kind;
      if (op.note) patch.note = op.note;
      if (Object.keys(patch).length) await db().from("money_flows").update(patch).eq("id", existing.id);
    }
  }
}

// Net income for the months elapsed accrues to the balance. Returns the new
// balance so the caller can keep the in-memory game object in sync.
export async function accrueIncome(
  gameId: string,
  oldDate: string,
  newDate: string,
  currentMoney: number,
): Promise<number> {
  const months = Math.max(0, Math.min(12, monthsBetween(oldDate, newDate)));
  if (months === 0) return currentMoney;
  const net = netMonthly(await getFlows(gameId));
  if (net === 0) return currentMoney;
  const money = currentMoney + net * months;
  await db().from("games").update({ money }).eq("id", gameId);
  return money;
}

export async function applyGoalOps(
  gameId: string,
  currentMoney: number,
  ops: NonNullable<TurnDelta["money_goals"]>,
): Promise<number> {
  let money = currentMoney;
  for (const op of ops) {
    if (!op?.label || typeof op.label !== "string") continue;

    if (op.action === "add") {
      const target = clampInt(op.target, 1, 10_000_000);
      await db().from("money_goals").insert({
        game_id: gameId,
        label: op.label.slice(0, 90),
        target,
        deadline: typeof op.deadline === "string" && /^\d{4}-\d{2}$/.test(op.deadline) ? op.deadline : null,
        source: op.source === "world" ? "world" : "self",
        stakes: op.stakes ?? null,
        note: op.note ?? null,
      });
      continue;
    }

    const { data: goal } = await db()
      .from("money_goals")
      .select("*")
      .eq("game_id", gameId)
      .eq("status", "active")
      .ilike("label", op.label)
      .maybeSingle();
    if (!goal) continue;

    if (op.action === "contribute") {
      const remaining = goal.target - goal.saved;
      const amount = Math.max(0, Math.min(clampInt(op.amount, 0, MONTHLY_CAP), money, remaining));
      if (amount <= 0) continue;
      const saved = goal.saved + amount;
      money -= amount;
      await db()
        .from("money_goals")
        .update({ saved, status: saved >= goal.target ? "met" : "active" })
        .eq("id", goal.id);
    } else if (op.action === "resolve") {
      const outcome = ["met", "failed", "abandoned"].includes(op.outcome as string)
        ? (op.outcome as string)
        : "abandoned";
      // Abandoning reclaims what you'd set aside; met/failed leave it spent.
      if (outcome === "abandoned" && goal.saved > 0) money += goal.saved;
      await db()
        .from("money_goals")
        .update({ status: outcome, saved: outcome === "abandoned" ? 0 : goal.saved })
        .eq("id", goal.id);
    }
  }

  if (money !== currentMoney) {
    await db().from("games").update({ money }).eq("id", gameId);
  }
  return money;
}
