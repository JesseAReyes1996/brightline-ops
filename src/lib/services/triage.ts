import type { Db, ObjectId } from "mongodb";
import { requestsCollection } from "../collections";
import { TRIAGE_FIELDS, type HistoryEvent, type RequestDetail, type TriageState, type TriageValues, type User } from "../domain";
import { ServiceError } from "../errors";
import { canManageTriage, isTriageRetryable } from "../permissions";
import { runTriage, type TriageConfig } from "../triage";
import { getRequestDetail, loadRequest } from "./queries";

/**
 * Runs triage for a request whose triage is already marked pending with
 * `attemptedAt`, then stores the outcome and its history event in one
 * `updateOne`. `actorId` is whoever triggered it: the submitter, or the Ops
 * member who retried.
 */
export async function runAndRecordTriage(
  db: Db,
  requestId: ObjectId,
  input: { title: string; description: string },
  attemptedAt: Date,
  actorId: string,
  config: TriageConfig,
): Promise<void> {
  const result = await runTriage(input, config);
  const now = new Date();
  const triage: TriageState =
    result.status === "complete"
      ? { status: "complete", suggestion: result.suggestion, model: config.model, error: null, attemptedAt }
      : { status: "failed", suggestion: null, model: config.model, error: result.error, attemptedAt };
  const event: HistoryEvent =
    result.status === "complete"
      ? { type: "triage_completed", at: now, actorId, detail: { model: config.model } }
      : { type: "triage_failed", at: now, actorId, detail: { error: result.error } };

  // Matching on attemptedAt means only the latest attempt is recorded: if a
  // newer retry started while this one ran, this result is dropped.
  await requestsCollection(db).updateOne(
    { _id: requestId, "triage.attemptedAt": attemptedAt },
    { $set: { triage, updatedAt: now }, $push: { history: event } },
  );
}

export async function retryTriage(db: Db, actor: User, id: string, config: TriageConfig): Promise<RequestDetail> {
  if (!canManageTriage(actor)) throw new ServiceError("forbidden", "Only the Ops team can retry triage.");
  const doc = await loadRequest(db, id);
  if (!isTriageRetryable(doc.triage, new Date())) {
    throw new ServiceError(
      "conflict",
      doc.triage.status === "complete"
        ? "Triage already completed. Override the values instead of re-running it."
        : "Triage is already running for this request.",
    );
  }

  // Claim the retry: the filter only matches the attempt we just checked, so
  // if two people click Retry at once, one of them gets a conflict.
  const attemptedAt = new Date();
  const claim = await requestsCollection(db).updateOne(
    { _id: doc._id, "triage.status": doc.triage.status, "triage.attemptedAt": doc.triage.attemptedAt },
    { $set: { "triage.status": "pending", "triage.error": null, "triage.attemptedAt": attemptedAt } },
  );
  if (claim.matchedCount === 0) {
    throw new ServiceError("conflict", "Someone else just retried triage on this request. Reload to see it.");
  }

  await runAndRecordTriage(db, doc._id, doc, attemptedAt, actor.id, config);
  return getRequestDetail(db, actor, id);
}

/**
 * Stores the values Ops confirmed. Values identical to the AI suggestion are a
 * `triage_accepted` event; any difference is a `triage_overridden` event that
 * lists the fields changed. With no suggestion (triage failed or is pending),
 * every field counts as overridden.
 */
export async function setAcceptedTriage(
  db: Db,
  actor: User,
  id: string,
  values: TriageValues,
): Promise<RequestDetail> {
  if (!canManageTriage(actor)) throw new ServiceError("forbidden", "Only the Ops team can accept or override triage.");
  const doc = await loadRequest(db, id);
  const { accepted, triage } = doc;
  if (accepted && TRIAGE_FIELDS.every((field) => accepted[field] === values[field])) {
    throw new ServiceError("invalid_input", "These triage values are already confirmed.");
  }

  const suggestion = triage.suggestion;
  const overriddenFields = TRIAGE_FIELDS.filter((field) => !suggestion || suggestion[field] !== values[field]);
  const now = new Date();
  const event: HistoryEvent =
    overriddenFields.length === 0
      ? { type: "triage_accepted", at: now, actorId: actor.id }
      : { type: "triage_overridden", at: now, actorId: actor.id, detail: { overriddenFields } };

  await requestsCollection(db).updateOne(
    { _id: doc._id },
    { $set: { accepted: { ...values }, updatedAt: now }, $push: { history: event } },
  );
  return getRequestDetail(db, actor, id);
}
