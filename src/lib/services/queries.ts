import { ObjectId, type Db } from "mongodb";
import { requestsCollection, type RequestDoc } from "../collections";
import { OPEN_STATUSES, type RequestDetail, type RequestView, type Status, type User } from "../domain";
import { ServiceError } from "../errors";
import { canViewRequest, isOps, requestActions } from "../permissions";

export async function listMyRequests(db: Db, actor: User): Promise<RequestView[]> {
  const docs = await requestsCollection(db).find({ requesterId: actor.id }).sort({ createdAt: -1 }).toArray();
  return docs.map(toRequestView);
}

/** The Ops queue, oldest first: open requests by default, one status, or "all". */
export async function listQueue(db: Db, actor: User, filter: { status?: Status | "all" }): Promise<RequestView[]> {
  if (!isOps(actor)) throw new ServiceError("forbidden", "Only the Ops team can see the queue.");
  const query =
    filter.status === "all" ? {} : { status: filter.status ?? { $in: [...OPEN_STATUSES] } };
  const docs = await requestsCollection(db).find(query).sort({ createdAt: 1 }).toArray();
  return docs.map(toRequestView);
}

export async function getRequestDetail(db: Db, actor: User, id: string): Promise<RequestDetail> {
  const doc = await loadRequest(db, id);
  if (!canViewRequest(actor, doc)) {
    throw new ServiceError("forbidden", "You can only view requests you submitted.");
  }
  return { request: toRequestView(doc), actions: requestActions(actor, doc) };
}

export async function loadRequest(db: Db, id: string): Promise<RequestDoc> {
  // Anything that isn't a 24-character hex id can't match, so treat it as not found.
  const doc = /^[0-9a-f]{24}$/i.test(id) ? await requestsCollection(db).findOne({ _id: new ObjectId(id) }) : null;
  if (!doc) throw new ServiceError("not_found", "Request not found.");
  return doc;
}

export function toRequestView(doc: RequestDoc): RequestView {
  const { _id, triage, history, createdAt, updatedAt, ...fields } = doc;
  return {
    id: _id.toHexString(),
    ...fields,
    triage: { ...triage, attemptedAt: triage.attemptedAt ? triage.attemptedAt.toISOString() : null },
    history: history.map((event) => ({ ...event, at: event.at.toISOString() })),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}
