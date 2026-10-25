import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/src/lib/db";
import { retryTriage } from "@/src/lib/services/triage";
import { triageConfigFromEnv } from "@/src/lib/triage";
import { handle, requireUser } from "@/app/api/_lib/http";

// Waits on AI triage (up to its 15s timeout); see app/api/requests/route.ts.
export const maxDuration = 60;

/**
 * Re-runs AI triage that failed or got stuck. Allowed for any Ops member while the
 * request is unassigned, then only the assignee or the Ops Lead. Never on a
 * Done or Closed request, even for the Ops Lead.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/requests/[id]/triage">) {
  return handle(async () => {
    const db = await getDb();
    const actor = await requireUser(req, db);
    const { id } = await ctx.params;
    return NextResponse.json(await retryTriage(db, actor, id, triageConfigFromEnv()));
  });
}
