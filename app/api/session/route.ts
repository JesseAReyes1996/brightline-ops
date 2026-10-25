import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/src/lib/db";
import { getUser } from "@/src/lib/services/users";
import { parseInput, sessionSchema } from "@/src/lib/validation";
import { currentUser, handle, readJson, USER_COOKIE } from "@/app/api/_lib/http";

/** Who the "Viewing as" picker currently says you are, or null. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const db = await getDb();
    return NextResponse.json({ user: await currentUser(req, db) });
  });
}

/** Switches the current user. Stand-in for SSO: no credentials, just a cookie. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const db = await getDb();
    const { userId } = parseInput(sessionSchema, await readJson(req));
    const user = await getUser(db, userId);
    const res = NextResponse.json({ user });
    res.cookies.set(USER_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return res;
  });
}
