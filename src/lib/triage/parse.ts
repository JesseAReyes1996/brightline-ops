import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CATEGORIES, URGENCIES, type TriageValues } from "../domain";
import { formatIssues, triageSummarySchema } from "../validation";
import { TRIAGE_TOOL_NAME } from "./prompt";

export type TriageParseResult = { ok: true; suggestion: TriageValues } | { ok: false; error: string };

const notAllowed = (field: string) => (issue: { input?: unknown }) =>
  issue.input === undefined ? "missing" : `${JSON.stringify(issue.input)} is not an allowed ${field}`;

// Strict: unexpected extra fields mean the output isn't what we asked for.
const triageOutputSchema = z.strictObject({
  category: z.enum(CATEGORIES, { error: notAllowed("category") }),
  urgency: z.enum(URGENCIES, { error: notAllowed("urgency") }),
  summary: triageSummarySchema,
});

/**
 * Turns the model's response into a suggestion, or a specific reason it can't
 * be used. Pure, so every failure case is unit-tested without calling the API.
 * Nothing is guessed or coerced: anything off the fixed lists fails.
 */
export function parseTriageResponse(
  response: Pick<Anthropic.Message, "stop_reason" | "stop_details" | "content">,
): TriageParseResult {
  if (response.stop_reason === "refusal") {
    const category = response.stop_details?.category;
    return { ok: false, error: `model declined to classify the request${category ? ` (${category})` : ""}` };
  }
  // A cut-off response can still hold a tool call whose input parses but is incomplete.
  if (response.stop_reason === "max_tokens") {
    return { ok: false, error: "model output was cut off (max_tokens)" };
  }

  const calls = response.content.filter(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === TRIAGE_TOOL_NAME,
  );
  if (calls.length === 0) return { ok: false, error: `model didn't call ${TRIAGE_TOOL_NAME}` };
  if (calls.length > 1) return { ok: false, error: `model called ${TRIAGE_TOOL_NAME} more than once` };

  const result = triageOutputSchema.safeParse(calls[0].input);
  if (!result.success) return { ok: false, error: `invalid AI output: ${formatIssues(result.error)}` };
  return { ok: true, suggestion: result.data };
}
