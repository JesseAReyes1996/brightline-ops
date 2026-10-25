import { describe, expect, it } from "vitest";
import { CLOSE_REASONS, OPEN_STATUSES, STATUSES, type Status } from "./domain";
import { availableTransitions, checkTransition } from "./transitions";

const assigned = (status: Status) => ({ status, assigneeId: "marcus" });
const rejected = (fragment: string) => ({ ok: false, reason: expect.stringContaining(fragment) });

describe("checkTransition", () => {
  describe("allowed moves", () => {
    it.each<[Status, Status]>([
      ["new", "in_progress"],
      ["in_progress", "waiting_on_requester"],
      ["waiting_on_requester", "in_progress"],
      ["in_progress", "done"],
    ])("%s → %s", (from, to) => {
      expect(checkTransition(assigned(from), to)).toEqual({ ok: true });
    });

    it.each(OPEN_STATUSES.flatMap((from) => CLOSE_REASONS.map((reason) => [from, reason] as const)))(
      "%s → closed with reason %s",
      (from, reason) => {
        expect(checkTransition(assigned(from), "closed", reason)).toEqual({ ok: true });
      },
    );

    it("new → closed works without an assignee", () => {
      expect(checkTransition({ status: "new", assigneeId: null }, "closed", "wont_do")).toEqual({ ok: true });
    });
  });

  describe("rejected moves", () => {
    it.each<[Status, Status]>([
      ["new", "done"],
      ["new", "waiting_on_requester"],
      ["in_progress", "new"],
      ["waiting_on_requester", "new"],
      ["waiting_on_requester", "done"],
    ])("%s → %s", (from, to) => {
      expect(checkTransition(assigned(from), to)).toEqual(rejected("Can't move a request from"));
    });

    it("new → in_progress without an assignee", () => {
      expect(checkTransition({ status: "new", assigneeId: null }, "in_progress")).toEqual(
        rejected("Assign this request before"),
      );
    });

    it.each(OPEN_STATUSES)("%s → itself", (status) => {
      expect(checkTransition(assigned(status), status)).toEqual(rejected("already"));
    });

    it.each(STATUSES.flatMap((to) => [["done", to] as const, ["closed", to] as const]))(
      "%s is terminal, so → %s is rejected (no reopening)",
      (from, to) => {
        expect(checkTransition(assigned(from), to, to === "closed" ? "wont_do" : undefined)).toEqual(
          rejected("can't be changed"),
        );
      },
    );
  });

  describe("close reasons", () => {
    it.each(OPEN_STATUSES)("closing from %s without a reason is rejected", (from) => {
      expect(checkTransition(assigned(from), "closed")).toEqual(rejected("A close reason is required"));
    });

    it("a close reason on a move that isn't closing is rejected", () => {
      expect(checkTransition(assigned("new"), "in_progress", "wont_do")).toEqual(
        rejected("can only be given when closing"),
      );
    });
  });
});

describe("availableTransitions", () => {
  it.each<[Status, string | null, Status[]]>([
    ["new", null, ["closed"]],
    ["new", "marcus", ["in_progress", "closed"]],
    ["in_progress", "marcus", ["waiting_on_requester", "done", "closed"]],
    ["waiting_on_requester", "marcus", ["in_progress", "closed"]],
    ["done", "marcus", []],
    ["closed", "marcus", []],
  ])("from %s (assignee %s) offers %j", (status, assigneeId, expected) => {
    expect(availableTransitions({ status, assigneeId })).toEqual(expected);
  });
});
