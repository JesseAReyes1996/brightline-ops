import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/src/lib/db";
import { listMyRequests, listQueue } from "@/src/lib/services/queries";
import { createRequest } from "@/src/lib/services/requests";
import { triageConfigFromEnv } from "@/src/lib/triage";
import { createRequestSchema, listRequestsQuerySchema, parseInput } from "@/src/lib/validation";
import { handle, readJson, requireUser } from "@/app/api/_lib/http";

// POST waits on AI triage (up to its 15s timeout) plus database work and a
// possible cold start. 60s leaves ample room and is allowed on every Vercel plan.
export const maxDuration = 60;

/** `?view=mine` (default): your own requests. `?view=queue[&status=…]`: the Ops queue. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const db = await getDb();
    const actor = await requireUser(req, db);
    const query = parseInput(listRequestsQuerySchema, Object.fromEntries(req.nextUrl.searchParams));
    const requests =
      query.view === "queue" ? await listQueue(db, actor, { status: query.status }) : await listMyRequests(db, actor);
    return NextResponse.json({ requests });
  });
}

/** Saves the request, runs AI triage (up to ~15s), and returns the request either way. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const db = await getDb();
    const actor = await requireUser(req, db);
    const input = parseInput(createRequestSchema, await readJson(req));
    const request = await createRequest(db, actor, input, triageConfigFromEnv());
    return NextResponse.json({ request }, { status: 201 });
  });
}
