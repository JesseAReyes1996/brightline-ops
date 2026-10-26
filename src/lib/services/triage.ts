import type { Db, ObjectId } from "mongodb";
import { requestsCollection } from "../collections";
import {
  STATUS_LABELS,
  TRIAGE_FIELDS,
  triageReviewEvent,
  type HistoryEvent,
  type RequestDetail,
  type TriageState,
  type TriageValues,
  type User,
} from "../domain";
import { ServiceError } from "../errors";
import { canRetryTriage, canReviewTriage, isOps, isTriageRetryable } from "../permissions";
import { isTerminal } from "../transitions";
import { runTriage, type TriageConfig } from "../triage";
import { getRequestDetail, loadRequest } from "./queries";

const NOT_YOURS = "Only the assignee or the Ops Lead can change this request.";

/**
 * Runs triage for a request whose triage is already marked pending with
 * `attemptedAt`, then stores the outcome and a history event per attempt in
 * one `updateOne`. When the model was asked to fix rejected output, both
 * attempts are recorded, numbered. `actorId` is whoever triggered it: the
 * submitter, or the Ops member who retried.
 */
export async function runAndRecordTriage(
  db: Db,
  requestId: ObjectId,
  input: { title: string; description: string },
  attemptedAt: Date,
  actorId: string,
  config: TriageConfig,
): Promise<void> {
  const attempts = await runTriage(input, config);
  const final = attempts[attempts.length - 1];
  const triage: TriageState =
    final.status === "complete"
      ? { status: "complete", suggestion: final.suggestion, model: config.model, error: null, attemptedAt }
      : { status: "failed", suggestion: null, model: config.model, error: final.error, attemptedAt };
  const events: HistoryEvent[] = attempts.map((a, i) => {
    const numbered = attempts.length > 1 ? { attempt: i + 1 } : {};
    return a.status === "complete"
      ? { type: "triage_completed", at: a.finishedAt, actorId, detail: { model: config.model, ...numbered } }
      : { type: "triage_failed", at: a.finishedAt, actorId, detail: { error: a.error, ...numbered } };
  });

  // Matching on attemptedAt means only the latest triage run is recorded: if a
  // newer retry started while this one ran, this result is dropped.
  await requestsCollection(db).updateOne(
    { _id: requestId, "triage.attemptedAt": attemptedAt },
    { $set: { triage, updatedAt: final.finishedAt }, $push: { history: { $each: events } } },
  );
}

export async function retryTriage(db: Db, actor: User, id: string, config: TriageConfig): Promise<RequestDetail> {
  if (!isOps(actor)) throw new ServiceError("forbidden", "Only the Ops team can retry triage.");
  const doc = await loadRequest(db, id);
  if (isTerminal(doc.status)) {
    throw new ServiceError("invalid_transition", `This request is ${STATUS_LABELS[doc.status]}, so AI triage can't be re-run.`);
  }
  if (!canRetryTriage(actor, doc)) throw new ServiceError("forbidden", NOT_YOURS);
  if (!isTriageRetryable(doc.triage, new Date())) {
    throw new ServiceError(
      "conflict",
      doc.triage.status === "complete"
        ? "Triage already completed. Override the values instead of re-running it."
        : "Triage is already running for this request.",
    );
  }

  // Claim the retry: the filter only matches the attempt we just checked, so
  // if two people click Retry at once, one of them gets a conflict. It also
  // requires the status and assignee we checked permissions against.
  const attemptedAt = new Date();
  const claim = await requestsCollection(db).updateOne(
    {
      _id: doc._id,
      status: doc.status,
      assigneeId: doc.assigneeId,
      "triage.status": doc.triage.status,
      "triage.attemptedAt": doc.triage.attemptedAt,
    },
    { $set: { "triage.status": "pending", "triage.error": null, "triage.attemptedAt": attemptedAt } },
  );
  if (claim.matchedCount === 0) {
    throw new ServiceError("conflict", "Someone else just changed this request. Reload to see the latest.");
  }

  await runAndRecordTriage(db, doc._id, doc, attemptedAt, actor.id, config);
  return getRequestDetail(db, actor, id);
}

/**
 * Stores the final triage values Ops set, with the history event from
 * triageReviewEvent: accepted, overridden, or (with no AI suggestion)
 * overridden and flagged as triaged by hand.
 */
export async function setAcceptedTriage(
  db: Db,
  actor: User,
  id: string,
  values: TriageValues,
): Promise<RequestDetail> {
  if (!isOps(actor)) throw new ServiceError("forbidden", "Only the Ops team can review triage.");
  const doc = await loadRequest(db, id);
  if (!canReviewTriage(actor, doc)) {
    throw new ServiceError(
      "forbidden",
      isTerminal(doc.status)
        ? `This request is ${STATUS_LABELS[doc.status]}; only the Ops Lead can change its triage.`
        : NOT_YOURS,
    );
  }
  const { accepted, triage } = doc;
  if (accepted && TRIAGE_FIELDS.every((field) => accepted[field] === values[field])) {
    throw new ServiceError("invalid_input", "These are already the final triage values.");
  }

  const now = new Date();
  const event = triageReviewEvent(triage.suggestion, values, actor.id, now);

  // Same guard as status changes: if the status or assignee changed since the
  // permission check, nothing matches and the caller gets a conflict.
  const result = await requestsCollection(db).updateOne(
    { _id: doc._id, status: doc.status, assigneeId: doc.assigneeId },
    { $set: { accepted: { ...values }, updatedAt: now }, $push: { history: event } },
  );
  if (result.matchedCount === 0) {
    throw new ServiceError("conflict", "Someone else just changed this request. Reload to see the latest.");
  }
  return getRequestDetail(db, actor, id);
}
