import { describe, expect, it } from "vitest";
import type { TriageState, User } from "./domain";
import { canAssign, canChangeStatus, canViewMetrics, isTriageRetryable, requestActions } from "./permissions";

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

describe("canAssign", () => {
  const unassigned = { assigneeId: null };
  const marcusHasIt = { assigneeId: "marcus" };

  it("lets an Ops member assign an unassigned request to themselves", () => {
    expect(canAssign(marcus, unassigned, "marcus")).toBe(true);
  });

  it("doesn't let an Ops member assign a request to someone else", () => {
    expect(canAssign(marcus, unassigned, "dana")).toBe(false);
    expect(canAssign(marcus, unassigned, "priya")).toBe(false);
  });

  it("doesn't let an Ops member take or hand off a request that's already assigned", () => {
    expect(canAssign(dana, marcusHasIt, "dana")).toBe(false);
    expect(canAssign(marcus, marcusHasIt, "dana")).toBe(false);
  });

  it("lets the Ops Lead assign and reassign to anyone", () => {
    expect(canAssign(priya, unassigned, "dana")).toBe(true);
    expect(canAssign(priya, marcusHasIt, "dana")).toBe(true);
    expect(canAssign(priya, marcusHasIt, "priya")).toBe(true);
  });

  it("doesn't let a requester assign anything", () => {
    expect(canAssign(sam, unassigned, "sam")).toBe(false);
    expect(canAssign(sam, unassigned, "marcus")).toBe(false);
  });
});

describe("canViewMetrics", () => {
  it("is only for the Ops Lead", () => {
    expect([priya, marcus, sam].map(canViewMetrics)).toEqual([true, false, false]);
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
      canSelfAssign: false,
      statusTransitions: [],
      closeReasons: [],
    });
  });

  it("offers an Ops member self-assignment only while the request is unassigned and open", () => {
    const unassigned = { ...request, assigneeId: null, status: "new" as const, triage };
    expect(requestActions(dana, unassigned)).toMatchObject({ canAssign: false, canSelfAssign: true });
    expect(requestActions(dana, { ...unassigned, assigneeId: "marcus" })).toMatchObject({ canSelfAssign: false });
    expect(requestActions(dana, { ...unassigned, status: "closed" })).toMatchObject({ canSelfAssign: false });
    expect(requestActions(sam, unassigned)).toMatchObject({ canSelfAssign: false });
  });
});
