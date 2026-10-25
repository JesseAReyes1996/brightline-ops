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
 * Whether `actor` may move `request` to `to`. The Ops Lead can make any change
 * and other Ops members can on requests assigned to them. Whoever submitted a
 * request may cancel it, and that is the only status change they can make.
 * Whether the move itself is allowed is a separate check (transitions.ts).
 */
export function canChangeStatus(
  actor: User,
  request: { requesterId: string; assigneeId: string | null },
  to: Status,
  closeReason?: CloseReason,
): boolean {
  if (isOpsLead(actor)) return true;
  if (actor.role === "ops" && request.assigneeId === actor.id) return true;
  return request.requesterId === actor.id && to === "closed" && closeReason === "cancelled_by_requester";
}

/** Accept or override the AI triage, or retry it. */
export function canManageTriage(actor: User): boolean {
  return isOps(actor);
}

/** Failed triage can be retried, and so can a pending attempt that has gone stale. Completed triage is overridden, not re-run. */
export function isTriageRetryable(triage: Pick<TriageState, "status" | "attemptedAt">, now: Date): boolean {
  if (triage.status === "failed") return true;
  if (triage.status !== "pending") return false;
  return triage.attemptedAt === null || now.getTime() - triage.attemptedAt.getTime() > STALE_TRIAGE_MS;
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
  return {
    canAssign: isOpsLead(actor) && open,
    canSelfAssign: open && request.assigneeId === null && canAssign(actor, request, actor.id),
    statusTransitions: transitions.filter((to) =>
      to === "closed" ? closeReasons.length > 0 : canChangeStatus(actor, request, to),
    ),
    closeReasons,
    canManageTriage: canManageTriage(actor),
    canRetryTriage: canManageTriage(actor) && isTriageRetryable(request.triage, now),
  };
}
