import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/src/lib/db";
import { setAcceptedTriage } from "@/src/lib/services/triage";
import { acceptedTriageSchema, parseInput } from "@/src/lib/validation";
import { handle, readJson, requireUser } from "@/app/api/_lib/http";

/** Accepts or overrides the AI triage: body is the confirmed `{ category, urgency, summary }`. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/requests/[id]/accepted">) {
  return handle(async () => {
    const db = await getDb();
    const actor = await requireUser(req, db);
    const { id } = await ctx.params;
    const values = parseInput(acceptedTriageSchema, await readJson(req));
    return NextResponse.json(await setAcceptedTriage(db, actor, id, values));
  });
}
