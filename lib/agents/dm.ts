import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODELS, RECORD_TURN_TOOL } from "../anthropic";
import { systemParam } from "../prompt";
import { TurnDelta } from "../types";

export interface DmResult {
  text: string;
  delta: TurnDelta;
  usage?: Anthropic.Usage;
}

// Run one DM turn. Streams prose via onText, then returns the full prose plus the
// structured TurnDelta captured from the record_turn tool call.
export async function runDmTurn(
  userMessage: string,
  opts: { useBig?: boolean; onText?: (chunk: string) => void },
): Promise<DmResult> {
  const model = opts.useBig ? MODELS.dmBig : MODELS.dm;

  const stream = anthropic().messages.stream({
    model,
    max_tokens: 2200,
    // Snappy streaming + lowest cost: no thinking for narration. Bookkeeping is
    // structured via the tool, so deep reasoning isn't needed.
    thinking: { type: "disabled" },
    system: systemParam(),
    tools: [RECORD_TURN_TOOL],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: userMessage }],
  });

  if (opts.onText) {
    stream.on("text", (chunk) => opts.onText!(chunk));
  }

  const final = await stream.finalMessage();

  let text = "";
  let delta: TurnDelta | null = null;
  for (const block of final.content) {
    if (block.type === "text") text += block.text;
    else if (block.type === "tool_use" && block.name === "record_turn") {
      delta = block.input as TurnDelta;
    }
  }

  // Defensive fallback: if the model forgot the tool call, synthesise a minimal
  // delta so the turn still persists cleanly.
  if (!delta) {
    delta = { summary: text.split("\n").find((l) => l.trim())?.slice(0, 160) || "(scene)" };
  }

  return { text: text.trim(), delta, usage: final.usage };
}
