import crypto from "node:crypto";
import { cookies } from "next/headers";

// Minimal single-player gate: a passcode unlocks a signed cookie. No user
// accounts, no Supabase Auth. The Anthropic + Supabase keys never leave the
// server; this just stops a random visitor to the public URL from playing/
// spending your API budget.

const COOKIE = "sls_session";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("Missing SESSION_SECRET. Copy .env.example to .env.local.");
  return s;
}

function sign(value: string): string {
  const sig = crypto.createHmac("sha256", secret()).update(value).digest("hex");
  return `${value}.${sig}`;
}

function verify(token: string | undefined): boolean {
  if (!token) return false;
  const idx = token.lastIndexOf(".");
  if (idx < 0) return false;
  const value = token.slice(0, idx);
  const expected = sign(value);
  // constant-time compare
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function checkPasscode(input: string): boolean {
  const pass = process.env.APP_PASSCODE;
  if (!pass) throw new Error("Missing APP_PASSCODE. Copy .env.example to .env.local.");
  const a = Buffer.from(input);
  const b = Buffer.from(pass);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function grantSession() {
  const jar = await cookies();
  jar.set(COOKIE, sign("ok"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function isAuthed(): Promise<boolean> {
  const jar = await cookies();
  return verify(jar.get(COOKIE)?.value);
}

// Guard for route handlers. Returns null if OK, or a 401 Response if not.
export async function requireAuth(): Promise<Response | null> {
  if (await isAuthed()) return null;
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
