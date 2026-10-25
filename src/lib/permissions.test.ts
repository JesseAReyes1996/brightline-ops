import { describe, expect, it } from "vitest";
import { CLOSE_REASONS, type Status, type TriageState, type User } from "./domain";
import {
  canAssign,
  canChangeStatus,
  canRetryTriage,
  canReviewTriage,
  canViewMetrics,
  isTriageRetryable,
  requestActions,
  sendBackNeedsUpdate,
} from "./permissions";

const priya: User = { id: "priya", name: "Priya", role: "ops_lead" };
const marcus: User = { id: "marcus", name: "Marcus", role: "ops" };
const dana: User = { id: "dana", name: "Dana", role: "ops" };
const sam: User = { id: "sam", name: "Sam", role: "requester" };
const alex: User = { id: "alex", name: "Alex", role: "requester" };

/** Sam's request, assigned to Marcus and in progress unless overridden. */
const request = (overrides: { assigneeId?: string | null; status?: Status; requesterId?: string } = {}) => ({
  requesterId: "sam",
  assigneeId: "marcus" as string | null,
  status: "in_progress" as Status,
  ...overrides,
});

const allowedCloseReasons = (actor: User, req = request()) =>
  CLOSE_REASONS.filter((reason) => canChangeStatus(actor, req, "closed", reason));

describe("canChangeStatus", () => {
  it("lets the Ops Lead make any change, assigned or not", () => {
    expect(canChangeStatus(priya, request(), "done")).toBe(true);
    expect(canChangeStatus(priya, request({ assigneeId: null, status: "new" }), "closed", "wont_do")).toBe(true);
  });

  it("lets Ops change only requests assigned to them", () => {
    expect(canChangeStatus(marcus, request(), "waiting_on_requester")).toBe(true);
    expect(canChangeStatus(dana, request(), "waiting_on_requester")).toBe(false);
    expect(canChangeStatus(dana, request(), "closed", "wont_do")).toBe(false);
    expect(canChangeStatus(dana, request({ assigneeId: null, status: "new" }), "closed", "wont_do")).toBe(false);
  });

  describe("close reasons by role", () => {
    it("requesters: only their own request, only as cancelled by requester", () => {
      expect(allowedCloseReasons(sam)).toEqual(["cancelled_by_requester"]);
      expect(canChangeStatus(sam, request(), "closed")).toBe(false);
      expect(allowedCloseReasons(alex)).toEqual([]);
    });

    it("Ops members: won't do or can't do on their own requests, never cancelled by requester", () => {
      expect(allowedCloseReasons(marcus)).toEqual(["wont_do", "cant_do"]);
      expect(allowedCloseReasons(dana)).toEqual([]);
    });

    it("the Ops Lead: any reason, including cancelled by requester", () => {
      expect(allowedCloseReasons(priya)).toEqual(["cancelled_by_requester", "wont_do", "cant_do"]);
    });

    it("an Ops member can still cancel a request they submitted themselves", () => {
      expect(allowedCloseReasons(dana, request({ requesterId: "dana" }))).toEqual(["cancelled_by_requester"]);
      expect(allowedCloseReasons(marcus, request({ requesterId: "marcus" }))).toEqual([
        "cancelled_by_requester",
        "wont_do",
        "cant_do",
      ]);
    });
  });

  describe("sending back to Ops", () => {
    const waiting = request({ status: "waiting_on_requester" });

    it("lets the requester move their own request from Waiting on requester to In progress", () => {
      expect(canChangeStatus(sam, waiting, "in_progress")).toBe(true);
      expect(canChangeStatus(alex, waiting, "in_progress")).toBe(false);
    });

    it("gives the requester no other moves", () => {
      expect(canChangeStatus(sam, request({ status: "new" }), "in_progress")).toBe(false);
      expect(canChangeStatus(sam, waiting, "done")).toBe(false);
    });

    it("requires an update from the requester, but not from the assignee or the Ops Lead", () => {
      expect(sendBackNeedsUpdate(sam, waiting, "in_progress")).toBe(true);
      expect(sendBackNeedsUpdate(marcus, waiting, "in_progress")).toBe(false);
      expect(sendBackNeedsUpdate(priya, waiting, "in_progress")).toBe(false);
      expect(sendBackNeedsUpdate(marcus, request({ status: "waiting_on_requester", requesterId: "marcus" }), "in_progress")).toBe(false);
    });
  });
});

describe("canReviewTriage", () => {
  it("lets any Ops member review an unassigned request", () => {
    expect(canReviewTriage(dana, request({ assigneeId: null, status: "new" }))).toBe(true);
  });

  it("limits an assigned request to its assignee and the Ops Lead", () => {
    expect(canReviewTriage(marcus, request())).toBe(true);
    expect(canReviewTriage(priya, request())).toBe(true);
    expect(canReviewTriage(dana, request())).toBe(false);
  });

  it("limits a Done or Closed request to the Ops Lead", () => {
    expect(canReviewTriage(priya, request({ status: "done" }))).toBe(true);
    expect(canReviewTriage(marcus, request({ status: "done" }))).toBe(false);
    expect(canReviewTriage(dana, request({ status: "closed", assigneeId: null }))).toBe(false);
  });

  it("never lets a requester review", () => {
    expect(canReviewTriage(sam, request({ assigneeId: null, status: "new" }))).toBe(false);
  });
});

describe("canRetryTriage", () => {
  it("follows the review rule on open requests", () => {
    expect(canRetryTriage(dana, request({ assigneeId: null, status: "new" }))).toBe(true);
    expect(canRetryTriage(dana, request())).toBe(false);
    expect(canRetryTriage(marcus, request())).toBe(true);
  });

  it("isn't allowed on a Done or Closed request, even for the Ops Lead", () => {
    expect(canRetryTriage(priya, request({ status: "closed" }))).toBe(false);
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
  const failedTriage: TriageState = { ...triage, status: "failed" };

  it("offers a requester only cancellation of their own open request", () => {
    expect(requestActions(sam, { ...request(), triage })).toMatchObject({
      canAssign: false,
      statusTransitions: ["closed"],
      closeReasons: ["cancelled_by_requester"],
      sendBackNeedsUpdate: false,
      canReviewTriage: false,
    });
  });

  it("offers a requester sending back to Ops, with an update, while it waits on them", () => {
    expect(requestActions(sam, { ...request({ status: "waiting_on_requester" }), triage })).toMatchObject({
      statusTransitions: ["in_progress", "closed"],
      closeReasons: ["cancelled_by_requester"],
      sendBackNeedsUpdate: true,
    });
  });

  it("offers the dropdown only the close reasons each role may pick", () => {
    expect(requestActions(marcus, { ...request(), triage }).closeReasons).toEqual(["wont_do", "cant_do"]);
    expect(requestActions(priya, { ...request(), triage }).closeReasons).toEqual(["cancelled_by_requester", "wont_do", "cant_do"]);
  });

  it("offers an Ops member nothing on someone else's assigned request", () => {
    expect(requestActions(dana, { ...request(), triage: failedTriage })).toMatchObject({
      canAssign: false,
      canSelfAssign: false,
      statusTransitions: [],
      closeReasons: [],
      canReviewTriage: false,
      canRetryTriage: false,
    });
  });

  it("offers only the Ops Lead's triage review on a finished request", () => {
    const done = { ...request({ status: "done" }), triage: failedTriage };
    expect(requestActions(priya, done)).toMatchObject({
      canAssign: false,
      canSelfAssign: false,
      statusTransitions: [],
      closeReasons: [],
      canReviewTriage: true,
      canRetryTriage: false,
    });
    expect(requestActions(marcus, done)).toMatchObject({ statusTransitions: [], canReviewTriage: false });
  });

  it("offers an Ops member self-assignment only while the request is unassigned and open", () => {
    const unassigned = { ...request({ assigneeId: null, status: "new" }), triage };
    expect(requestActions(dana, unassigned)).toMatchObject({ canAssign: false, canSelfAssign: true, canReviewTriage: true });
    expect(requestActions(dana, { ...unassigned, assigneeId: "marcus" })).toMatchObject({ canSelfAssign: false });
    expect(requestActions(dana, { ...unassigned, status: "closed" })).toMatchObject({ canSelfAssign: false });
    expect(requestActions(sam, unassigned)).toMatchObject({ canSelfAssign: false });
  });
});
