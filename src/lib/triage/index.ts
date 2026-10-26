import Anthropic from "@anthropic-ai/sdk";
import type { TriageValues } from "../domain";
import { callTriageModel, type TriageModelSettings } from "./call";
import { parseTriageResponse } from "./parse";
import { buildRepairPrompt, buildTriagePrompt, type TriagePrompt } from "./prompt";

const DEFAULT_TRIAGE_MODEL = "claude-haiku-5-5";
const TRIAGE_TIMEOUT_MS = 15_000;
// A whole triage, including the one repair attempt, stays under 30 seconds.
// A little is held back for saving the result.
const TRIAGE_BUDGET_MS = 28_000;
// A repair call with less time than this left isn't worth starting.
const MIN_REPAIR_MS = 3_000;
// Decides which calendar day "today" is in the prompt. UTC is what Vercel's
// servers use, and it keeps local and hosted runs identical. Change it to an
// IANA zone such as "America/Chicago" to use the company's local day.
const TRIAGE_TIME_ZONE = "UTC";

export interface TriageConfig {
  apiKey: string | undefined;
  model: string;
  /** Per call to the model. */
  timeoutMs: number;
}

export function triageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): TriageConfig {
  return {
    apiKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
    model: env.ANTHROPIC_MODEL?.trim() || DEFAULT_TRIAGE_MODEL,
    timeoutMs: TRIAGE_TIMEOUT_MS,
  };
}

export type TriageAttempt = { finishedAt: Date } & (
  | { status: "complete"; suggestion: TriageValues }
  | { status: "failed"; error: string }
);

/** Swappable in tests, so the repair flow runs without a network or a real clock. */
export interface TriageDeps {
  callModel?: (settings: TriageModelSettings, prompt: TriagePrompt) => Promise<Anthropic.Message>;
  /** Current time in milliseconds. */
  now?: () => number;
}

/**
 * Classifies one request. Never throws: a missing key, a timeout, an API
 * error, a refusal, or output that fails validation all come back as a
 * `failed` attempt with a reason that is safe to store and show.
 *
 * Returns every attempt in order; the last one is the outcome. There is a
 * second attempt only when the model's record_triage call failed validation:
 * the error goes back to the model as an error tool result and it's asked to
 * call the tool again. Its output is never truncated or rewritten here.
 * Timeouts, API errors, and refusals are not retried.
 */
export async function runTriage(
  input: { title: string; description: string },
  config: TriageConfig,
  deps: TriageDeps = {},
): Promise<TriageAttempt[]> {
  const callModel = deps.callModel ?? callTriageModel;
  const now = deps.now ?? Date.now;
  if (!config.apiKey) return [{ status: "failed", error: "no API key configured", finishedAt: new Date(now()) }];

  const started = now();
  const settings = { apiKey: config.apiKey, model: config.model };
  const prompt = buildTriagePrompt(input, new Date(started), TRIAGE_TIME_ZONE);
  const first = await attempt(callModel, now, { ...settings, timeoutMs: config.timeoutMs }, prompt);
  if (!first.repair) return [first.outcome];

  const remaining = TRIAGE_BUDGET_MS - (now() - started);
  if (remaining < MIN_REPAIR_MS) return [first.outcome];
  const repairPrompt = buildRepairPrompt(prompt, first.repair.response, first.repair.toolUseId, first.repair.error);
  const second = await attempt(
    callModel,
    now,
    { ...settings, timeoutMs: Math.min(config.timeoutMs, remaining) },
    repairPrompt,
  );
  return [first.outcome, second.outcome];
}

type Repairable = { response: Anthropic.Message; toolUseId: string; error: string };

async function attempt(
  callModel: NonNullable<TriageDeps["callModel"]>,
  now: () => number,
  settings: TriageModelSettings,
  prompt: TriagePrompt,
): Promise<{ outcome: TriageAttempt; repair?: Repairable }> {
  let response: Anthropic.Message;
  try {
    response = await callModel(settings, prompt);
  } catch (err) {
    const error = describeCallError(err, settings.timeoutMs);
    return { outcome: { status: "failed", error, finishedAt: new Date(now()) } };
  }

  const finishedAt = new Date(now());
  const parsed = parseTriageResponse(response);
  if (parsed.ok) return { outcome: { status: "complete", suggestion: parsed.suggestion, finishedAt } };
  return {
    outcome: { status: "failed", error: parsed.error, finishedAt },
    repair: parsed.toolUseId ? { response, toolUseId: parsed.toolUseId, error: parsed.error } : undefined,
  };
}

// Most specific first: in this SDK the timeout error is a connection error, and
// both are subclasses of APIError. None of these messages contain the API key.
function describeCallError(err: unknown, timeoutMs: number): string {
  if (err instanceof Anthropic.APIConnectionTimeoutError) return `timed out after ${Math.round(timeoutMs / 1000)}s`;
  if (err instanceof Anthropic.APIConnectionError) return "couldn't reach the Anthropic API";
  if (err instanceof Anthropic.AuthenticationError) return "the Anthropic API rejected the API key (401)";
  if (err instanceof Anthropic.APIError) return `Anthropic API error: ${err.message}`;
  return `unexpected error: ${err instanceof Error ? err.message : String(err)}`;
}
