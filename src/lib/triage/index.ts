import Anthropic from "@anthropic-ai/sdk";
import type { TriageValues } from "../domain";
import { callTriageModel } from "./call";
import { parseTriageResponse } from "./parse";
import { buildTriagePrompt } from "./prompt";

export const DEFAULT_TRIAGE_MODEL = "claude-haiku-5-5";
const TRIAGE_TIMEOUT_MS = 15_000;

export interface TriageConfig {
  apiKey: string | undefined;
  model: string;
  timeoutMs: number;
}

export function triageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): TriageConfig {
  return {
    apiKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
    model: env.ANTHROPIC_MODEL?.trim() || DEFAULT_TRIAGE_MODEL,
    timeoutMs: TRIAGE_TIMEOUT_MS,
  };
}

export type TriageResult = { status: "complete"; suggestion: TriageValues } | { status: "failed"; error: string };

/**
 * Classifies one request. Never throws: a missing key, a timeout, an API
 * error, a refusal, or output that fails validation all come back as
 * `failed` with a reason that is safe to store and show.
 */
export async function runTriage(
  input: { title: string; description: string },
  config: TriageConfig,
): Promise<TriageResult> {
  if (!config.apiKey) return { status: "failed", error: "no API key configured" };

  let response: Anthropic.Message;
  try {
    response = await callTriageModel({ ...config, apiKey: config.apiKey }, buildTriagePrompt(input));
  } catch (err) {
    return { status: "failed", error: describeCallError(err, config.timeoutMs) };
  }

  const parsed = parseTriageResponse(response);
  return parsed.ok ? { status: "complete", suggestion: parsed.suggestion } : { status: "failed", error: parsed.error };
}

// Most specific first: in this SDK the timeout error is a connection error, and
// both are subclasses of APIError. None of these messages contain the API key.
function describeCallError(err: unknown, timeoutMs: number): string {
  if (err instanceof Anthropic.APIConnectionTimeoutError) return `timed out after ${timeoutMs / 1000}s`;
  if (err instanceof Anthropic.APIConnectionError) return "couldn't reach the Anthropic API";
  if (err instanceof Anthropic.AuthenticationError) return "the Anthropic API rejected the API key (401)";
  if (err instanceof Anthropic.APIError) return `Anthropic API error: ${err.message}`;
  return `unexpected error: ${err instanceof Error ? err.message : String(err)}`;
}
