import { checkPasscode, grantSession, isAuthed } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ authed: await isAuthed() });
}

export async function POST(req: Request) {
  const { passcode } = await req.json().catch(() => ({ passcode: "" }));
  if (typeof passcode !== "string" || !checkPasscode(passcode)) {
    return Response.json({ error: "wrong passcode" }, { status: 401 });
  }
  await grantSession();
  return Response.json({ ok: true });
}
