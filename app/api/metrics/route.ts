import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/src/lib/db";
import { getMetricsReport } from "@/src/lib/services/metrics";
import { handle, requireUser } from "@/app/api/_lib/http";

/** Per-category durations and AI triage review rates (Ops Lead only). Durations are in milliseconds. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const db = await getDb();
    const actor = await requireUser(req, db);
    return NextResponse.json(await getMetricsReport(db, actor));
  });
}
