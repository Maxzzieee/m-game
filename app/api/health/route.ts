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
  try {
    const { error } = await db().from("games").select("id, heng, money, profile").limit(1);
    checks.database = error ? `ERROR: ${error.message}` : "ok";
    if (!error) errors = await recentErrors(10);
  } catch (err) {
    checks.database = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
  }

  const healthy =
    Object.entries(checks).every(([k, v]) => k === "APP_PASSCODE_2" || !v.startsWith("ERROR") && v !== "MISSING") &&
    errors.length === 0;

  return Response.json({
    healthy,
    checks,
    recent_errors: errors.map((e) => ({
      at: e.created_at,
      scope: e.scope,
      message: e.message,
      context: e.context,
    })),
  });
}
