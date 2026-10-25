import { STATUS_LABELS, type CloseReason, type Status } from "./domain";

const ALLOWED_TRANSITIONS: Record<Status, readonly Status[]> = {
  new: ["in_progress", "closed"],
  in_progress: ["waiting_on_requester", "done", "closed"],
  waiting_on_requester: ["in_progress", "closed"],
  done: [],
  closed: [],
};

export function isTerminal(status: Status): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

/**
 * Decides whether `request` may move to `to`. Pure, so it is the single
 * source of truth for both the service layer and the tests.
 */
export function checkTransition(
  request: { status: Status; assigneeId: string | null },
  to: Status,
  closeReason?: CloseReason,
): TransitionCheck {
  const from = request.status;
  if (isTerminal(from)) {
    return { ok: false, reason: `This request is ${STATUS_LABELS[from]} and can't be changed.` };
  }
  if (from === to) {
    return { ok: false, reason: `This request is already ${STATUS_LABELS[to]}.` };
  }
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    return { ok: false, reason: `Can't move a request from ${STATUS_LABELS[from]} to ${STATUS_LABELS[to]}.` };
  }
  if (to === "in_progress" && !request.assigneeId) {
    return { ok: false, reason: "Assign this request before moving it to In progress." };
  }
  if (to === "closed" && !closeReason) {
    return { ok: false, reason: "A close reason is required to close a request." };
  }
  if (to !== "closed" && closeReason) {
    return { ok: false, reason: "A close reason can only be given when closing a request." };
  }
  return { ok: true };
}

/**
 * Statuses `request` could move to right now. Closed is included when allowed;
 * the caller still has to pick a reason, so it's checked with a stand-in one.
 */
export function availableTransitions(request: { status: Status; assigneeId: string | null }): Status[] {
  return ALLOWED_TRANSITIONS[request.status].filter(
    (to) => checkTransition(request, to, to === "closed" ? "wont_do" : undefined).ok,
  );
}
