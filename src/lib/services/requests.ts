import { ObjectId, type Db } from "mongodb";
import { requestsCollection, type RequestDoc } from "../collections";
import { STATUS_LABELS, type HistoryEvent, type RequestDetail, type RequestView, type User } from "../domain";
import { ServiceError } from "../errors";
import { canAssign, canChangeStatus, isOps, sendBackNeedsUpdate } from "../permissions";
import { checkTransition, isTerminal } from "../transitions";
import type { TriageConfig } from "../triage";
import type { AssignInput, CreateRequestInput, StatusChangeInput } from "../validation";
import { getRequestDetail, loadRequest, toRequestView } from "./queries";
import { runAndRecordTriage } from "./triage";
import { findUser } from "./users";

/**
 * Saves the request with triage pending, then runs triage and returns the
 * request as it ends up. The request is saved first so no triage problem can
 * lose it, and the submitter always gets it back.
 */
export async function createRequest(
  db: Db,
  actor: User,
  input: CreateRequestInput,
  triageConfig: TriageConfig,
): Promise<RequestView> {
  const now = new Date();
  const doc: RequestDoc = {
    _id: new ObjectId(),
    title: input.title,
    description: input.description,
    requesterId: actor.id,
    requesterUrgency: input.urgency,
    status: "new",
    closeReason: null,
    assigneeId: null,
    triage: { status: "pending", suggestion: null, model: null, error: null, attemptedAt: now },
    accepted: null,
    history: [{ type: "created", at: now, actorId: actor.id }],
    createdAt: now,
    updatedAt: now,
  };
  const requests = requestsCollection(db);
  await requests.insertOne(doc);

  // runTriage already turns every model or validation problem into a failed
  // triage. This catch covers anything else (e.g. the database write), which
  // leaves triage pending; Ops can retry it once it goes stale.
  try {
    await runAndRecordTriage(db, doc._id, input, now, actor.id, triageConfig);
  } catch (err) {
    console.error(`[triage] Couldn't record triage for request ${doc._id.toHexString()}:`, err);
  }
  const saved = await requests.findOne({ _id: doc._id }).catch(() => null);
  return toRequestView(saved ?? doc);
}

export async function assignRequest(db: Db, actor: User, id: string, input: AssignInput): Promise<RequestDetail> {
  if (!isOps(actor)) throw new ServiceError("forbidden", "Only the Ops team can assign requests.");
  const doc = await loadRequest(db, id);
  if (isTerminal(doc.status)) {
    throw new ServiceError("invalid_transition", `This request is ${STATUS_LABELS[doc.status]} and can't be reassigned.`);
  }
  const assignee = await findUser(db, input.assigneeId);
  if (!assignee || !isOps(assignee)) {
    throw new ServiceError("invalid_input", "Requests can only be assigned to members of the Ops team.");
  }
  if (!canAssign(actor, doc, assignee.id)) {
    // An Ops member who isn't the Lead failed one of two rules. Taking a
    // request someone already has is a conflict, not a permission error:
    // it's what the slower of two people racing to take a request gets.
    if (doc.assigneeId) {
      const current = await findUser(db, doc.assigneeId);
      throw new ServiceError(
        "conflict",
        `This request is already assigned to ${current?.name ?? doc.assigneeId}. Only the Ops Lead can reassign it.`,
      );
    }
    throw new ServiceError("forbidden", "You can only assign requests to yourself. The Ops Lead assigns them to others.");
  }
  if (doc.assigneeId === assignee.id) {
    throw new ServiceError("invalid_input", `This request is already assigned to ${assignee.name}.`);
  }

  const now = new Date();
  const event: HistoryEvent = {
    type: "assigned",
    at: now,
    actorId: actor.id,
    fromAssigneeId: doc.assigneeId,
    toAssigneeId: assignee.id,
  };
  await applyChange(db, doc, { assigneeId: assignee.id, updatedAt: now }, event);
  return getRequestDetail(db, actor, id);
}

export async function changeStatus(db: Db, actor: User, id: string, input: StatusChangeInput): Promise<RequestDetail> {
  const doc = await loadRequest(db, id);
  if (!canChangeStatus(actor, doc, input.status, input.closeReason)) {
    throw new ServiceError("forbidden", statusDeniedMessage(actor, doc, input));
  }
  const check = checkTransition(doc, input.status, input.closeReason);
  if (!check.ok) throw new ServiceError("invalid_transition", check.reason);

  const sendingBack = doc.status === "waiting_on_requester" && input.status === "in_progress";
  if (input.note && !sendingBack) {
    throw new ServiceError("invalid_input", "An update can only be added when sending a request back to Ops.");
  }
  if (sendBackNeedsUpdate(actor, doc, input.status) && !input.note) {
    throw new ServiceError("invalid_input", "Add your update for the Ops team before sending this back.");
  }

  const now = new Date();
  const detail = {
    ...(input.closeReason ? { closeReason: input.closeReason } : {}),
    ...(input.note ? { note: input.note } : {}),
  };
  const event: HistoryEvent = {
    type: "status_changed",
    at: now,
    actorId: actor.id,
    fromStatus: doc.status,
    toStatus: input.status,
    ...(Object.keys(detail).length ? { detail } : {}),
  };
  await applyChange(
    db,
    doc,
    { status: input.status, updatedAt: now, ...(input.closeReason ? { closeReason: input.closeReason } : {}) },
    event,
  );
  return getRequestDetail(db, actor, id);
}

function statusDeniedMessage(actor: User, doc: RequestDoc, input: StatusChangeInput): string {
  if (actor.role === "ops") {
    return doc.assigneeId === actor.id && input.closeReason === "cancelled_by_requester"
      ? 'Only the requester or the Ops Lead can close a request as "Cancelled by requester".'
      : "Only the assignee or the Ops Lead can change this request.";
  }
  return doc.requesterId === actor.id
    ? "You can cancel your request, or send it back to Ops when it's waiting on you. Other changes are up to the Ops team."
    : "You can only change requests you submitted.";
}

/**
 * Writes the field changes and appends the history event in one `updateOne`,
 * so a request's state and its history can't drift apart.
 *
 * The filter also requires the status and assignee to still be what we
 * checked permissions and transition rules against. If someone else changed
 * either in the meantime, nothing matches and we report a conflict instead of
 * overwriting their change. That covers two people acting on the same request.
 */
async function applyChange(
  db: Db,
  current: RequestDoc,
  changes: Partial<Pick<RequestDoc, "status" | "closeReason" | "assigneeId" | "updatedAt">>,
  event: HistoryEvent,
): Promise<void> {
  const result = await requestsCollection(db).updateOne(
    { _id: current._id, status: current.status, assigneeId: current.assigneeId },
    { $set: changes, $push: { history: event } },
  );
  if (result.matchedCount === 0) {
    throw new ServiceError("conflict", "Someone else just updated this request. Reload to see the latest.");
  }
}
