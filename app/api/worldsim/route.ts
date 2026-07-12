import { requireAuth } from "@/lib/session";
import { latestGame } from "@/lib/game";
import { maybeRunWorldSim } from "@/lib/agents/worldsim";

export const runtime = "nodejs";
export const maxDuration = 30;

// Fired once by the client on load. The server decides whether the world
// should have moved (real-time gap since last play) and, if so, runs the
// world-sim agent. Fire-and-forget from the UI's perspective.
export async function POST() {
  const guard = await requireAuth();
  if (guard) return guard;

  const game = await latestGame();
  if (!game) return Response.json({ ran: false });

  try {
    const ran = await maybeRunWorldSim(game);
    return Response.json({ ran });
  } catch {
    // The world failing to move must never block play.
    return Response.json({ ran: false });
  }
}
