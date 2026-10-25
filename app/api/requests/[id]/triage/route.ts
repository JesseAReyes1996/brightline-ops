import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/src/lib/db";
import { retryTriage } from "@/src/lib/services/triage";
import { triageConfigFromEnv } from "@/src/lib/triage";
import { handle, requireUser } from "@/app/api/_lib/http";

/** Retries AI triage (Ops and Ops Lead only). */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/requests/[id]/triage">) {
  return handle(async () => {
    const db = await getDb();
    const actor = await requireUser(req, db);
    const { id } = await ctx.params;
    return NextResponse.json(await retryTriage(db, actor, id, triageConfigFromEnv()));
  });
}
