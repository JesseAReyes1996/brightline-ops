import type { Db, ObjectId } from "mongodb";
import type { RequestFields, Role } from "./domain";

export interface UserDoc {
  _id: string;
  name: string;
  role: Role;
}

export type RequestDoc = RequestFields<Date> & { _id: ObjectId };

export function usersCollection(db: Db) {
  return db.collection<UserDoc>("users");
}

export function requestsCollection(db: Db) {
  return db.collection<RequestDoc>("requests");
}

export async function ensureIndexes(db: Db): Promise<void> {
  await requestsCollection(db).createIndexes([
    { key: { requesterId: 1, createdAt: -1 } }, // My Requests
    { key: { status: 1, createdAt: 1 } }, // Ops queue
  ]);
}
