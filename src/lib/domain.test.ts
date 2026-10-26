import { describe, expect, it } from "vitest";
import { triageReviewEvent, type TriageValues } from "./domain";

const AT = new Date("2026-10-25T15:00:00Z");
const suggestion: TriageValues = { category: "system_access", urgency: "high", summary: "Needs a Salesforce login." };

describe("triageReviewEvent", () => {
  it("records accepting the AI suggestion unchanged", () => {
    expect(triageReviewEvent(suggestion, { ...suggestion }, "hannah", AT)).toEqual({
      type: "triage_accepted",
      at: AT,
      actorId: "hannah",
    });
  });

  it("records an override with the fields that changed", () => {
    expect(triageReviewEvent(suggestion, { ...suggestion, urgency: "low" }, "hannah", AT)).toEqual({
      type: "triage_overridden",
      at: AT,
      actorId: "hannah",
      detail: { overriddenFields: ["urgency"] },
    });
  });

  it("flags triage by hand when there was no AI suggestion, keeping the same event type", () => {
    expect(triageReviewEvent(null, suggestion, "hannah", AT)).toEqual({
      type: "triage_overridden",
      at: AT,
      actorId: "hannah",
      detail: { overriddenFields: ["category", "urgency", "summary"], noSuggestion: true },
    });
  });
});
