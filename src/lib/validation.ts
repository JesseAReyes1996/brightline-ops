import { z } from "zod";
import { CATEGORIES, CLOSE_REASONS, STATUSES, SUMMARY_MAX_LENGTH, UPDATE_NOTE_MAX_LENGTH, URGENCIES } from "./domain";
import { ServiceError } from "./errors";

export const createRequestSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Title must be 120 characters or fewer"),
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(5000, "Description must be 5000 characters or fewer"),
  urgency: z.enum(URGENCIES),
});
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const assignSchema = z.object({
  assigneeId: z.string().min(1, "assigneeId is required"),
});
export type AssignInput = z.infer<typeof assignSchema>;

// Whether closeReason is required (or allowed) depends on the target status,
// which is a transition rule, so that check lives in transitions.ts. Likewise
// whether a note is required or allowed is checked in the service.
export const statusChangeSchema = z.object({
  status: z.enum(STATUSES),
  closeReason: z.enum(CLOSE_REASONS).optional(),
  note: z
    .string()
    .trim()
    .min(1, "Your update can't be empty")
    .max(UPDATE_NOTE_MAX_LENGTH, `Your update must be ${UPDATE_NOTE_MAX_LENGTH} characters or fewer`)
    .optional(),
});
export type StatusChangeInput = z.infer<typeof statusChangeSchema>;

export const sessionSchema = z.object({
  userId: z.string().min(1, "userId is required"),
});

/** For the queue: no status means open requests only; "all" means every status. */
export const listRequestsQuerySchema = z.object({
  view: z.enum(["mine", "queue"]).default("mine"),
  status: z.enum([...STATUSES, "all"]).optional(),
});

/**
 * A triage summary: one line, trimmed, non-empty, at most 140 characters.
 * The same rule applies to the AI's output and to a summary Ops types in.
 */
export const triageSummarySchema = z
  .string({ error: (issue) => (issue.input === undefined ? "missing" : "must be text") })
  .trim()
  .min(1, "must not be empty")
  .max(SUMMARY_MAX_LENGTH, `must be ${SUMMARY_MAX_LENGTH} characters or fewer`)
  .refine((summary) => !/[\r\n]/.test(summary), "must be a single line");

/** The final triage values Ops sets when accepting or overriding the AI suggestion. */
export const acceptedTriageSchema = z.object({
  category: z.enum(CATEGORIES),
  urgency: z.enum(URGENCIES),
  summary: triageSummarySchema,
});

/** "field: problem; other: problem" from a zod error. */
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ");
}

/** Parses `data` with `schema`, throwing an `invalid_input` ServiceError listing every problem. */
export function parseInput<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) throw new ServiceError("invalid_input", formatIssues(result.error));
  return result.data;
}
