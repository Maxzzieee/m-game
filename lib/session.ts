import crypto from "node:crypto";
import { cookies } from "next/headers";

// Household gate: each passcode maps to a PROFILE, and every save belongs to a
// profile. Same URL, two lives: APP_PASSCODE → 'main', APP_PASSCODE_2 → 'p2'.
// No accounts; the signed cookie carries which profile is playing. Keys stay
// server-side; this just stops strangers (and keeps the two lives separate).

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

function verify(token: string | undefined): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const value = token.slice(0, idx);
  const expected = sign(value);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value; // the profile id
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Which profile does this passcode unlock? null = wrong passcode.
// Each passcode maps to its own profile (separate lives): APP_PASSCODE → 'main',
// APP_PASSCODE_2 → 'p2', APP_PASSCODE_3 → 'p3'. Add more the same way.
export function profileForPasscode(input: string): string | null {
  const main = process.env.APP_PASSCODE;
  if (!main) throw new Error("Missing APP_PASSCODE. Copy .env.example to .env.local.");
  if (safeEqual(input, main)) return "main";
  const p2 = process.env.APP_PASSCODE_2;
  if (p2 && safeEqual(input, p2)) return "p2";
  const p3 = process.env.APP_PASSCODE_3;
  if (p3 && safeEqual(input, p3)) return "p3";
  return null;
}

export async function grantSession(profile: string) {
  const jar = await cookies();
  jar.set(COOKIE, sign(profile), {
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

export async function sessionProfile(): Promise<string | null> {
  const jar = await cookies();
  const value = verify(jar.get(COOKIE)?.value);
  // Back-compat: pre-profile cookies carried the literal value "ok".
  if (value === "ok") return "main";
  return value;
}

export async function isAuthed(): Promise<boolean> {
  return (await sessionProfile()) !== null;
}

// Guard for route handlers: returns the profile id, or a 401 Response.
export async function requireProfile(): Promise<string | Response> {
  const profile = await sessionProfile();
  if (profile) return profile;
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
