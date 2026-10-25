import { CLOSE_REASONS, type CloseReason, type RequestActions, type Status, type TriageState, type User } from "./domain";
import { availableTransitions, isTerminal } from "./transitions";

// A triage attempt is pending for at most the model timeout (15s). One still
// pending after a minute died mid-flight (say, the server restarted) and may be retried.
const STALE_TRIAGE_MS = 60_000;

export function isOps(user: Pick<User, "role">): boolean {
  return user.role === "ops" || user.role === "ops_lead";
}

export function isOpsLead(user: Pick<User, "role">): boolean {
  return user.role === "ops_lead";
}

export function canViewRequest(actor: User, request: { requesterId: string }): boolean {
  return isOps(actor) || request.requesterId === actor.id;
}

/**
 * Whether `actor` may assign `request` to `assigneeId` (who must be on the Ops
 * team; the service checks that). The Ops Lead can assign and reassign to
 * anyone. Other Ops members can only take an unassigned request themselves,
 * so there's a backup when the Lead is out.
 */
export function canAssign(actor: User, request: { assigneeId: string | null }, assigneeId: string): boolean {
  if (isOpsLead(actor)) return true;
  return actor.role === "ops" && request.assigneeId === null && assigneeId === actor.id;
}

export function canViewMetrics(actor: User): boolean {
  return isOpsLead(actor);
}

/**
 * Whether `actor` may move `request` to `to` (with `closeReason`, when
 * closing). Whether the move itself is allowed is a separate check
 * (transitions.ts), which also stops any change to a Done or Closed request.
 *
 * - The Ops Lead can make any change, with any close reason, so a request
 *   from someone who has left isn't orphaned.
 * - Whoever submitted a request can cancel it, and can send it back to Ops
 *   from Waiting on requester (with an update; see sendBackNeedsUpdate).
 * - Other Ops members work the requests assigned to them, closing as "won't
 *   do" or "can't do" but never on the requester's behalf.
 */
export function canChangeStatus(
  actor: User,
  request: { requesterId: string; assigneeId: string | null; status: Status },
  to: Status,
  closeReason?: CloseReason,
): boolean {
  if (isOpsLead(actor)) return true;
  if (request.requesterId === actor.id) {
    if (to === "closed" && closeReason === "cancelled_by_requester") return true;
    if (to === "in_progress" && request.status === "waiting_on_requester") return true;
  }
  return actor.role === "ops" && request.assigneeId === actor.id && closeReason !== "cancelled_by_requester";
}

/**
 * The requester answering "waiting on requester" must say what changed. Not
 * required when the person moving it is the Lead or the assignee, even if they
 * also submitted the request.
 */
export function sendBackNeedsUpdate(
  actor: User,
  request: { requesterId: string; assigneeId: string | null; status: Status },
  to: Status,
): boolean {
  return (
    !isOpsLead(actor) &&
    request.requesterId === actor.id &&
    request.assigneeId !== actor.id &&
    request.status === "waiting_on_requester" &&
    to === "in_progress"
  );
}

/**
 * Accept, override, or edit the triage review. Any Ops member can review an
 * unassigned request; once assigned, only the assignee or the Ops Lead can.
 * On a Done or Closed request only the Ops Lead can, to fix a category for
 * the metrics.
 */
export function canReviewTriage(actor: User, request: { status: Status; assigneeId: string | null }): boolean {
  if (isOpsLead(actor)) return true;
  if (actor.role !== "ops" || isTerminal(request.status)) return false;
  return request.assigneeId === null || request.assigneeId === actor.id;
}

/** Failed triage can be retried, and so can a pending attempt that has gone stale. Completed triage is overridden, not re-run. */
export function isTriageRetryable(triage: Pick<TriageState, "status" | "attemptedAt">, now: Date): boolean {
  if (triage.status === "failed") return true;
  if (triage.status !== "pending") return false;
  return triage.attemptedAt === null || now.getTime() - triage.attemptedAt.getTime() > STALE_TRIAGE_MS;
}

/** Re-running AI triage changes the request, so it follows the review rule, but never on a finished request. */
export function canRetryTriage(actor: User, request: { status: Status; assigneeId: string | null }): boolean {
  return !isTerminal(request.status) && canReviewTriage(actor, request);
}

export function requestActions(
  actor: User,
  request: { status: Status; requesterId: string; assigneeId: string | null; triage: TriageState },
  now: Date = new Date(),
): RequestActions {
  const transitions = availableTransitions(request);
  const closeReasons = transitions.includes("closed")
    ? CLOSE_REASONS.filter((reason) => canChangeStatus(actor, request, "closed", reason))
    : [];
  const open = !isTerminal(request.status);
  const statusTransitions = transitions.filter((to) =>
    to === "closed" ? closeReasons.length > 0 : canChangeStatus(actor, request, to),
  );
  return {
    canAssign: isOpsLead(actor) && open,
    canSelfAssign: open && request.assigneeId === null && canAssign(actor, request, actor.id),
    statusTransitions,
    closeReasons,
    sendBackNeedsUpdate: statusTransitions.includes("in_progress") && sendBackNeedsUpdate(actor, request, "in_progress"),
    canReviewTriage: canReviewTriage(actor, request),
    canRetryTriage: canRetryTriage(actor, request) && isTriageRetryable(request.triage, now),
  };
}
