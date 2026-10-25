import { NextResponse } from "next/server";
import { getDb } from "@/src/lib/db";
import { listUsers } from "@/src/lib/services/users";
import { handle } from "@/app/api/_lib/http";

// Unauthenticated on purpose: the "Viewing as" picker needs the list before anyone is picked.
export async function GET() {
  return handle(async () => {
    const db = await getDb();
    return NextResponse.json({ users: await listUsers(db) });
  });
}
