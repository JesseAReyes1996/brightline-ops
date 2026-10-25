import { describe, expect, it } from "vitest";
import type { TriageState, User } from "./domain";
import { canChangeStatus, isTriageRetryable, requestActions } from "./permissions";

const priya: User = { id: "priya", name: "Priya", role: "ops_lead" };
const marcus: User = { id: "marcus", name: "Marcus", role: "ops" };
const dana: User = { id: "dana", name: "Dana", role: "ops" };
const sam: User = { id: "sam", name: "Sam", role: "requester" };
const alex: User = { id: "alex", name: "Alex", role: "requester" };

const request = { requesterId: "sam", assigneeId: "marcus" };

describe("canChangeStatus", () => {
  it("lets the Ops Lead make any change, assigned or not", () => {
    expect(canChangeStatus(priya, request, "done")).toBe(true);
    expect(canChangeStatus(priya, { ...request, assigneeId: null }, "closed", "wont_do")).toBe(true);
  });

  it("lets Ops change only requests assigned to them", () => {
    expect(canChangeStatus(marcus, request, "in_progress")).toBe(true);
    expect(canChangeStatus(dana, request, "in_progress")).toBe(false);
    expect(canChangeStatus(dana, request, "closed", "wont_do")).toBe(false);
  });

  it("lets a requester cancel their own request, and nothing else", () => {
    expect(canChangeStatus(sam, request, "closed", "cancelled_by_requester")).toBe(true);
    expect(canChangeStatus(sam, request, "closed", "wont_do")).toBe(false);
    expect(canChangeStatus(sam, request, "closed")).toBe(false);
    expect(canChangeStatus(sam, request, "in_progress")).toBe(false);
  });

  it("doesn't let a requester cancel someone else's request", () => {
    expect(canChangeStatus(alex, request, "closed", "cancelled_by_requester")).toBe(false);
  });

  it("lets an Ops member cancel a request they submitted", () => {
    expect(canChangeStatus(dana, { requesterId: "dana", assigneeId: "marcus" }, "closed", "cancelled_by_requester")).toBe(true);
  });
});

describe("isTriageRetryable", () => {
  const now = new Date("2026-03-02T09:00:00Z");
  const secondsAgo = (s: number) => new Date(now.getTime() - s * 1000);
  const triage = (status: TriageState["status"], attemptedAt: Date | null) => ({ status, attemptedAt });

  it("allows retrying a failed triage", () => {
    expect(isTriageRetryable(triage("failed", secondsAgo(5)), now)).toBe(true);
  });

  it("doesn't re-run a completed triage", () => {
    expect(isTriageRetryable(triage("complete", secondsAgo(500)), now)).toBe(false);
  });

  it("allows retrying a pending triage only once it has gone stale", () => {
    expect(isTriageRetryable(triage("pending", secondsAgo(10)), now)).toBe(false);
    expect(isTriageRetryable(triage("pending", secondsAgo(61)), now)).toBe(true);
    expect(isTriageRetryable(triage("pending", null), now)).toBe(true);
  });
});

describe("requestActions", () => {
  const triage: TriageState = { status: "complete", suggestion: null, model: "m", error: null, attemptedAt: new Date() };

  it("offers a requester only cancellation of their own open request", () => {
    expect(requestActions(sam, { ...request, status: "in_progress", triage })).toMatchObject({
      canAssign: false,
      statusTransitions: ["closed"],
      closeReasons: ["cancelled_by_requester"],
      canManageTriage: false,
    });
  });

  it("offers nothing on a finished request", () => {
    expect(requestActions(priya, { ...request, status: "done", triage })).toMatchObject({
      canAssign: false,
      statusTransitions: [],
      closeReasons: [],
    });
  });
});
