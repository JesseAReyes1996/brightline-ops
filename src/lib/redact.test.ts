import { describe, expect, it } from "vitest";
import type { HistoryEvent, RequestView, User } from "./domain";
import { redactForViewer } from "./redact";

const sam: User = { id: "sam", name: "Sam", role: "requester" };
const marcus: User = { id: "marcus", name: "Marcus", role: "ops" };
const priya: User = { id: "priya", name: "Priya", role: "ops_lead" };

const at = "2026-10-25T15:00:00.000Z";
const history: HistoryEvent<string>[] = [
  { type: "created", at, actorId: "sam" },
  { type: "triage_failed", at, actorId: "sam", detail: { error: "invalid AI output: summary too long", attempt: 1 } },
  { type: "triage_completed", at, actorId: "sam", detail: { model: "claude-haiku-5-5", attempt: 2 } },
  { type: "assigned", at, actorId: "priya", fromAssigneeId: null, toAssigneeId: "marcus" },
  { type: "triage_failed", at, actorId: "marcus", detail: { error: "timed out after 15s" } },
];

const view: RequestView = {
  id: "6ade0000000000000000000a",
  title: "Badge",
  description: "Broken",
  requesterId: "sam",
  requesterUrgency: "low",
  status: "new",
  closeReason: null,
  assigneeId: "marcus",
  triage: { status: "failed", suggestion: null, model: "claude-haiku-5-5", error: "timed out after 15s", attemptedAt: at },
  accepted: null,
  history,
  createdAt: at,
  updatedAt: at,
};

describe("redactForViewer", () => {
  it("removes AI triage failures from a requester's view", () => {
    const redacted = redactForViewer(sam, view);
    expect(redacted.history.map((e) => e.type)).toEqual(["created", "triage_completed", "assigned"]);
    expect(redacted.triage.error).toBeNull();
    expect(JSON.stringify(redacted)).not.toMatch(/timed out|invalid AI output|"attempt"/);
  });

  it("keeps the rest of the request intact for the requester", () => {
    const redacted = redactForViewer(sam, view);
    expect(redacted.history[1]).toEqual({ type: "triage_completed", at, actorId: "sam", detail: { model: "claude-haiku-5-5" } });
    expect({ ...redacted, history: [], triage: null }).toEqual({ ...view, history: [], triage: null });
  });

  it("shows Ops everything", () => {
    expect(redactForViewer(marcus, view)).toBe(view);
    expect(redactForViewer(priya, view)).toBe(view);
  });
});
