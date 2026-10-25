// Shared plumbing for route handlers: identity from the cookie, JSON body
// parsing, and turning ServiceErrors into HTTP responses. This is the only
// API-side code that knows about Next.js; the services under src/lib don't.

import { NextResponse, type NextRequest } from "next/server";
import type { Db } from "mongodb";
import type { User } from "@/src/lib/domain";
import { ServiceError, type ServiceErrorCode } from "@/src/lib/errors";
import { findUser } from "@/src/lib/services/users";

/** Holds the user id chosen in the "Viewing as" picker (a stand-in for SSO). */
export const USER_COOKIE = "brightline_user";

const HTTP_STATUS: Record<ServiceErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  invalid_transition: 409,
  conflict: 409,
};

/** Runs a route body and converts thrown errors into `{ error }` JSON responses. */
export async function handle(body: () => Promise<Response>): Promise<Response> {
  try {
    return await body();
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: HTTP_STATUS[err.code] });
    }
    console.error("[api] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong on the server." }, { status: 500 });
  }
}

export async function currentUser(req: NextRequest, db: Db): Promise<User | null> {
  const userId = req.cookies.get(USER_COOKIE)?.value;
  return userId ? findUser(db, userId) : null;
}

export async function requireUser(req: NextRequest, db: Db): Promise<User> {
  const user = await currentUser(req, db);
  if (!user) throw new ServiceError("unauthenticated", 'Pick a user from "Viewing as" first.');
  return user;
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ServiceError("invalid_input", "Request body must be valid JSON.");
  }
}
