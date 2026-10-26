import type { RequestView, User } from "./domain";
import { isOps } from "./permissions";

/**
 * What a request looks like to `viewer`. Ops see everything. Anyone else (in
 * practice, the requester) doesn't see AI triage failures: triage_failed
 * events are removed from the history, the triage error text is cleared, and
 * attempt numbers, which would hint at a failed first try, are dropped.
 */
export function redactForViewer(viewer: User, view: RequestView): RequestView {
  if (isOps(viewer)) return view;
  return {
    ...view,
    triage: { ...view.triage, error: null },
    history: view.history
      .filter((event) => event.type !== "triage_failed")
      .map((event) =>
        event.type === "triage_completed" && event.detail ? { ...event, detail: { model: event.detail.model } } : event,
      ),
  };
}
