// Turn-stream protocol markers, shared by the /api/turn route and the client.
// Control characters — they can never appear in the DM's prose.
export const MARK_BOOKKEEPING = "\x1e"; // prose done; tool call generating
export const MARK_STATE = "\x1f"; // everything after is a JSON state payload

// The light state payload inlined at the end of the turn stream, so the client
// can render choices/sheet instantly without a second round trip.
import type { ChoiceOption, Game, Pursuit } from "./types";
import type { AwaitingRoll } from "./turn";

export interface InlineState {
  game: Game;
  awaiting_roll: AwaitingRoll | null;
  choices: ChoiceOption[] | null;
  next_beat: { label: string; date: string } | null;
  scene_hook: string | null;
  pursuit: Pursuit | null;
}
