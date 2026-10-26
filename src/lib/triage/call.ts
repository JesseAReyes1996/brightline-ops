import Anthropic from "@anthropic-ai/sdk";
import type { TriagePrompt } from "./prompt";

export interface TriageModelSettings {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

/** Sends the triage prompt to Claude. Throws the SDK's errors; index.ts turns them into failure reasons. */
export async function callTriageModel(settings: TriageModelSettings, prompt: TriagePrompt): Promise<Anthropic.Message> {
  // No retries: a timed-out attempt would otherwise be retried, stretching the
  // submitter's wait to a multiple of the timeout. Ops can retry triage instead.
  const client = new Anthropic({ apiKey: settings.apiKey, timeout: settings.timeoutMs, maxRetries: 0 });
  return client.messages.create({
    model: settings.model,
    // Room for adaptive thinking (on by default on Haiku 5.5) plus the tool call.
    max_tokens: 2048,
    // Low effort is plenty for a classification and keeps it fast.
    // No temperature/top_p/top_k: current models reject non-default values.
    output_config: { effort: "low" },
    ...prompt,
  });
}
