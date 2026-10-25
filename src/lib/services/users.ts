import type { Db } from "mongodb";
import { usersCollection, type UserDoc } from "../collections";
import type { Role, User } from "../domain";
import { ServiceError } from "../errors";

const ROLE_ORDER: Record<Role, number> = { ops_lead: 0, ops: 1, requester: 2 };

function toUser(doc: UserDoc): User {
  return { id: doc._id, name: doc.name, role: doc.role };
}

/** All users, Ops Lead first, then Ops, then requesters, each group by name. */
export async function listUsers(db: Db): Promise<User[]> {
  const docs = await usersCollection(db).find().toArray();
  return docs
    .map(toUser)
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name));
}

export async function findUser(db: Db, id: string): Promise<User | null> {
  const doc = await usersCollection(db).findOne({ _id: id });
  return doc ? toUser(doc) : null;
}

export async function getUser(db: Db, id: string): Promise<User> {
  const user = await findUser(db, id);
  if (!user) throw new ServiceError("not_found", `No user with id "${id}".`);
  return user;
}
