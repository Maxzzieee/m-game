import { db } from "./supabase";

// Error capture. Previously every failure was swallowed by a bare `catch {}` —
// the app broke silently and the only symptom was a spinning die. Now failures
// are recorded (best-effort, never throwing) and surfaced via /api/health.

export async function captureError(
  scope: string,
  err: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  // Always make it visible in the server log / Vercel runtime logs.
  console.error(`[${scope}] ${message}`, context);

  try {
    await db()
      .from("app_errors")
      .insert({ scope, message: message.slice(0, 2000), stack: stack?.slice(0, 8000), context });
  } catch {
    // Logging must never break the game. Console already has it.
  }
}

export interface ErrorRow {
  id: string;
  created_at: string;
  scope: string;
  message: string;
  context: Record<string, unknown>;
}

export async function recentErrors(limit = 20): Promise<ErrorRow[]> {
  const { data } = await db()
    .from("app_errors")
    .select("id, created_at, scope, message, context")
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as ErrorRow[]) ?? [];
}
