import { describe, expect, it } from "vitest";
import type { CloseReason, HistoryEvent, Status } from "../domain";
import { aggregateMetrics, computeRequestMetrics } from "./index";

const MINUTE = 60_000;
const START = new Date("2026-03-02T09:00:00Z").getTime();
/** `m` minutes after the request was created. */
const at = (m: number) => new Date(START + m * MINUTE);

const created = (m: number): HistoryEvent => ({ type: "created", at: at(m), actorId: "sam" });
const assigned = (m: number, to: string, from: string | null = null): HistoryEvent => ({
  type: "assigned",
  at: at(m),
  actorId: "priya",
  fromAssigneeId: from,
  toAssigneeId: to,
});
const moved = (m: number, fromStatus: Status, toStatus: Status, closeReason?: CloseReason): HistoryEvent => ({
  type: "status_changed",
  at: at(m),
  actorId: "marcus",
  fromStatus,
  toStatus,
  ...(closeReason ? { detail: { closeReason } } : {}),
});
const triaged = (m: number): HistoryEvent => ({ type: "triage_completed", at: at(m), actorId: "sam" });

/** Minutes, so expectations read naturally. */
const inMinutes = (metrics: ReturnType<typeof computeRequestMetrics>) =>
  Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, v === null ? null : v / MINUTE]));

describe("computeRequestMetrics", () => {
  it("measures a normal lifecycle", () => {
    const history = [
      created(0),
      triaged(0.1),
      assigned(30, "marcus"),
      moved(90, "new", "in_progress"),
      moved(330, "in_progress", "done"),
    ];
    expect(inMinutes(computeRequestMetrics(history))).toEqual({
      timeToAssignment: 30,
      timeToPickup: 60,
      handlingTime: 240,
      waitingOnRequesterTime: 0,
    });
  });

  it("excludes time waiting on the requester from handling time", () => {
    const history = [
      created(0),
      assigned(10, "marcus"),
      moved(20, "new", "in_progress"), // 40 in progress
      moved(60, "in_progress", "waiting_on_requester"), // 40 waiting
      moved(100, "waiting_on_requester", "in_progress"), // 30 in progress
      moved(130, "in_progress", "waiting_on_requester"), // 60 waiting
      moved(190, "waiting_on_requester", "in_progress"), // 10 in progress
      moved(200, "in_progress", "done"),
    ];
    expect(inMinutes(computeRequestMetrics(history))).toEqual({
      timeToAssignment: 10,
      timeToPickup: 10,
      handlingTime: 80,
      waitingOnRequesterTime: 100,
    });
  });

  it("uses the first assignment when the request is reassigned", () => {
    const history = [
      created(0),
      assigned(15, "marcus"),
      assigned(45, "dana", "marcus"),
      moved(75, "new", "in_progress"),
      moved(135, "in_progress", "done"),
    ];
    expect(inMinutes(computeRequestMetrics(history))).toEqual({
      timeToAssignment: 15,
      timeToPickup: 60, // from the first assignment at 15, not the reassignment at 45
      handlingTime: 60,
      waitingOnRequesterTime: 0,
    });
  });

  describe("a request never picked up", () => {
    it("assigned but still New: only time to assignment", () => {
      expect(inMinutes(computeRequestMetrics([created(0), assigned(20, "marcus")]))).toEqual({
        timeToAssignment: 20,
        timeToPickup: null,
        handlingTime: null,
        waitingOnRequesterTime: null,
      });
    });

    it("never assigned: everything null", () => {
      expect(computeRequestMetrics([created(0), triaged(0.1)])).toEqual({
        timeToAssignment: null,
        timeToPickup: null,
        handlingTime: null,
        waitingOnRequesterTime: null,
      });
    });

    it("closed straight from New: no pickup and no handling", () => {
      const history = [created(0), assigned(5, "theo"), moved(30, "new", "closed", "cancelled_by_requester")];
      expect(inMinutes(computeRequestMetrics(history))).toEqual({
        timeToAssignment: 5,
        timeToPickup: null,
        handlingTime: null,
        waitingOnRequesterTime: null,
      });
    });
  });

  it("leaves handling and waiting null while the request is still open", () => {
    const history = [created(0), assigned(5, "marcus"), moved(10, "new", "in_progress")];
    expect(inMinutes(computeRequestMetrics(history))).toEqual({
      timeToAssignment: 5,
      timeToPickup: 5,
      handlingTime: null,
      waitingOnRequesterTime: null,
    });
  });

  it("counts a close while waiting on the requester as waiting time, not handling", () => {
    const history = [
      created(0),
      assigned(5, "luis"),
      moved(20, "new", "in_progress"),
      moved(50, "in_progress", "waiting_on_requester"),
      moved(100, "waiting_on_requester", "closed", "cant_do"),
    ];
    expect(inMinutes(computeRequestMetrics(history))).toMatchObject({ handlingTime: 30, waitingOnRequesterTime: 50 });
  });
});

describe("aggregateMetrics", () => {
  const finished = (assignAt: number, pickupAt: number, doneAt: number) => [
    created(0),
    assigned(assignAt, "marcus"),
    moved(pickupAt, "new", "in_progress"),
    moved(doneAt, "in_progress", "done"),
  ];

  it("groups by accepted category, falling back to untriaged, in the fixed category order", () => {
    const groups = aggregateMetrics([
      { accepted: null, history: [created(0)] },
      { accepted: { category: "system_access" }, history: finished(10, 20, 30) },
      { accepted: { category: "laptops_hardware" }, history: finished(10, 20, 30) },
      { accepted: { category: "system_access" }, history: finished(10, 20, 30) },
    ]);
    expect(groups.map((g) => [g.category, g.requestCount])).toEqual([
      ["laptops_hardware", 1],
      ["system_access", 2],
      ["untriaged", 1],
    ]);
  });

  it("reports count, median, and average, skipping requests a metric doesn't apply to", () => {
    const [group] = aggregateMetrics([
      { accepted: { category: "other" }, history: finished(10, 20, 30) },
      { accepted: { category: "other" }, history: finished(20, 30, 40) },
      { accepted: { category: "other" }, history: finished(60, 70, 80) },
      { accepted: { category: "other" }, history: [created(0), assigned(30, "dana")] }, // not picked up
    ]);
    expect(group.requestCount).toBe(4);
    // Time to assignment: 10, 20, 60, 30 → median of four is the mean of the middle two.
    expect(group.timeToAssignment).toEqual({ count: 4, median: 25 * MINUTE, average: 30 * MINUTE });
    // Handling: 10, 10, 10 from the three finished requests only.
    expect(group.handlingTime).toEqual({ count: 3, median: 10 * MINUTE, average: 10 * MINUTE });
  });

  it("gives null median and average when no request in the group has a value", () => {
    const [group] = aggregateMetrics([{ accepted: null, history: [created(0)] }]);
    expect(group.timeToPickup).toEqual({ count: 0, median: null, average: null });
  });
});
