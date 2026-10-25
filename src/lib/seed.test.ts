import { describe, expect, it } from "vitest";
import { overriddenTriageFields, type Status, type User } from "./domain";
import { canAssign, canChangeStatus, canReviewTriage, sendBackNeedsUpdate } from "./permissions";
import { buildSeedRequests, SEED_USERS } from "./seed";
import { checkTransition } from "./transitions";

const NOW = new Date("2026-03-02T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const requests = buildSeedRequests(NOW);
const users = new Map<string, User>(SEED_USERS.map((u) => [u._id, { id: u._id, name: u.name, role: u.role }]));

describe("seed data", () => {
  it.each(requests.map((r) => [r.title, r] as const))("%s: history replays through the real rules", (_, request) => {
    let status: Status = "new";
    let assigneeId: string | null = null;
    let previous = 0;

    for (const event of request.history) {
      expect(event.at.getTime()).toBeGreaterThanOrEqual(previous);
      expect(event.at.getTime()).toBeLessThan(NOW.getTime());
      previous = event.at.getTime();
      const actor = users.get(event.actorId);
      expect(actor, `unknown actor ${event.actorId}`).toBeDefined();

      if (event.type === "assigned") {
        expect(canAssign(actor!, { assigneeId }, event.toAssigneeId!)).toBe(true);
        expect(event.fromAssigneeId).toBe(assigneeId);
        expect(users.get(event.toAssigneeId!)?.role).not.toBe("requester");
        assigneeId = event.toAssigneeId!;
      }
      if (event.type === "status_changed") {
        const { toStatus, detail } = event;
        const current = { requesterId: request.requesterId, assigneeId, status };
        expect(event.fromStatus).toBe(status);
        expect(checkTransition(current, toStatus!, detail?.closeReason)).toEqual({ ok: true });
        expect(canChangeStatus(actor!, current, toStatus!, detail?.closeReason)).toBe(true);
        if (sendBackNeedsUpdate(actor!, current, toStatus!)) expect(detail?.note).toBeTruthy();
        status = toStatus!;
      }
      if (event.type === "triage_accepted" || event.type === "triage_overridden") {
        expect(canReviewTriage(actor!, { status, assigneeId })).toBe(true);
      }
    }

    expect(request.status).toBe(status);
    expect(request.assigneeId).toBe(assigneeId);
    expect(request.updatedAt).toEqual(request.history.at(-1)!.at);

    const review = request.history.findLast((e) => e.type === "triage_accepted" || e.type === "triage_overridden");
    if (request.accepted) {
      const overridden = overriddenTriageFields(request.triage.suggestion, request.accepted);
      expect(review?.type).toBe(overridden.length ? "triage_overridden" : "triage_accepted");
      expect(review?.detail?.overriddenFields).toEqual(overridden.length ? overridden : undefined);
    } else {
      expect(review).toBeUndefined();
    }
  });

  it("has recent finished requests with enough variety for /metrics", () => {
    const finished = requests.filter((r) => r.status === "done" || r.status === "closed");
    const recent = finished.filter((r) => NOW.getTime() - r.createdAt.getTime() <= 21 * DAY);
    const waitedAndResumed = finished.filter((r) =>
      r.history.some((e) => e.fromStatus === "waiting_on_requester" && e.toStatus === "in_progress"),
    );
    const reassigned = finished.filter((r) => r.history.some((e) => e.type === "assigned" && e.fromAssigneeId));

    expect(recent.length).toBeGreaterThanOrEqual(8);
    expect(new Set(recent.map((r) => r.accepted?.category)).size).toBeGreaterThanOrEqual(3);
    expect(waitedAndResumed.length).toBeGreaterThanOrEqual(2);
    expect(reassigned.length).toBeGreaterThanOrEqual(1);
    expect(recent.every((r) => r.accepted !== null || r.title.startsWith("Expense tool"))).toBe(true);
    expect(requests.filter((r) => r.history.some((e) => e.type === "triage_overridden")).length).toBeGreaterThanOrEqual(3);
  });
});
