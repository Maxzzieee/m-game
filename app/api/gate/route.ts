import { grantSession, isAuthed, profileForPasscode } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ authed: await isAuthed() });
}

export async function POST(req: Request) {
  const { passcode } = await req.json().catch(() => ({ passcode: "" }));
  const profile = typeof passcode === "string" ? profileForPasscode(passcode) : null;
  if (!profile) {
    return Response.json({ error: "wrong passcode" }, { status: 401 });
  }
  await grantSession(profile);
  return Response.json({ ok: true, profile });
}
