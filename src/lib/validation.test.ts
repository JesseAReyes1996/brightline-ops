import { describe, expect, it } from "vitest";
import { ServiceError } from "./errors";
import { listRequestsQuerySchema, parseInput, statusChangeSchema } from "./validation";

describe("statusChangeSchema note", () => {
  const parse = (note: unknown) => parseInput(statusChangeSchema, { status: "in_progress", note });

  it("trims the requester's update", () => {
    expect(parse("  Here's the seat count: 12.  ").note).toBe("Here's the seat count: 12.");
  });

  it("accepts up to 1,000 characters", () => {
    expect(parse("x".repeat(1000)).note).toHaveLength(1000);
  });

  it.each([
    ["empty", "   ", "can't be empty"],
    ["too long", "x".repeat(1001), "1000 characters or fewer"],
  ])("rejects an update that is %s", (_, note, message) => {
    expect(() => parse(note)).toThrow(ServiceError);
    expect(() => parse(note)).toThrow(message);
  });

  it("is optional", () => {
    expect(parseInput(statusChangeSchema, { status: "done" }).note).toBeUndefined();
  });
});

describe("listRequestsQuerySchema status", () => {
  it.each(["new", "done", "closed", "all"])("accepts %s", (status) => {
    expect(parseInput(listRequestsQuerySchema, { view: "queue", status }).status).toBe(status);
  });

  it("defaults to no status filter, which means open requests", () => {
    expect(parseInput(listRequestsQuerySchema, { view: "queue" }).status).toBeUndefined();
  });

  it("rejects anything else", () => {
    expect(() => parseInput(listRequestsQuerySchema, { view: "queue", status: "open" })).toThrow(ServiceError);
  });
});
