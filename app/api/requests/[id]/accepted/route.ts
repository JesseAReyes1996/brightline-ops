import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/src/lib/db";
import { setAcceptedTriage } from "@/src/lib/services/triage";
import { acceptedTriageSchema, parseInput } from "@/src/lib/validation";
import { handle, readJson, requireUser } from "@/app/api/_lib/http";

/**
 * Sets the final triage (accepting or overriding the AI suggestion). Body: the
 * final `{ category, urgency, summary }`. Allowed for any Ops member while the
 * request is unassigned, then only the assignee or the Ops Lead; on a Done or
 * Closed request, only the Ops Lead.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/requests/[id]/accepted">) {
  return handle(async () => {
    const db = await getDb();
    const actor = await requireUser(req, db);
    const { id } = await ctx.params;
    const values = parseInput(acceptedTriageSchema, await readJson(req));
    return NextResponse.json(await setAcceptedTriage(db, actor, id, values));
  });
}
