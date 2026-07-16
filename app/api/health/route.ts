import { requireProfile } from "@/lib/session";
import { recentErrors } from "@/lib/log";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";

// One URL that answers "is anything broken?" — DB reachable, env present, and
// whatever has failed recently (previously invisible: errors were swallowed).
export async function GET() {
  const auth = await requireProfile();
  if (auth instanceof Response) return auth;

  const checks: Record<string, string> = {};

  // Env
  for (const key of [
    "ANTHROPIC_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "APP_PASSCODE",
    "SESSION_SECRET",
  ]) {
    checks[key] = process.env[key] ? "set" : "MISSING";
  }
  checks.APP_PASSCODE_2 = process.env.APP_PASSCODE_2 ? "set" : "unset (single player)";

  // DB reachability + schema drift (a missing migration is the classic outage)
  let errors: Awaited<ReturnType<typeof recentErrors>> = [];
  const missing: string[] = [];
  try {
    const { error } = await db().from("games").select("id, heng, money, profile").limit(1);
    checks.database = error ? `ERROR: ${error.message}` : "ok";
    if (!error) errors = await recentErrors(10);
  } catch (err) {
    checks.database = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Name exactly which migrations haven't been applied, instead of guessing.
  const EXPECTED = [
    "001_initial",
    "002_money_and_avatar",
    "003_pursuits",
    "004_profiles",
    "005_heng",
    "006_errors",
    "007_atomic_turn_and_tracking",
  ];
  try {
    const { data, error } = await db().from("schema_migrations").select("version");
    if (error) {
      checks.migrations = "UNKNOWN — run 007_atomic_turn_and_tracking.sql to enable tracking";
    } else {
      const applied = new Set((data ?? []).map((r: { version: string }) => r.version));
      missing.push(...EXPECTED.filter((v) => !applied.has(v)));
      checks.migrations = missing.length ? `MISSING: ${missing.join(", ")}` : "all applied";
    }
  } catch {
    checks.migrations = "UNKNOWN — tracking table not present";
  }

  const healthy =
    Object.entries(checks).every(
      ([k, v]) =>
        k === "APP_PASSCODE_2" ||
        (!v.startsWith("ERROR") && !v.startsWith("MISSING") && !v.startsWith("UNKNOWN") && v !== "MISSING"),
    ) && errors.length === 0;

  return Response.json({
    healthy,
    checks,
    missing_migrations: missing,
    recent_errors: errors.map((e) => ({
      at: e.created_at,
      scope: e.scope,
      message: e.message,
      context: e.context,
    })),
  });
}
