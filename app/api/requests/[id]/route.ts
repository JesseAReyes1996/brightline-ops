import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/src/lib/db";
import { getRequestDetail } from "@/src/lib/services/queries";
import { handle, requireUser } from "@/app/api/_lib/http";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/requests/[id]">) {
  return handle(async () => {
    const db = await getDb();
    const actor = await requireUser(req, db);
    const { id } = await ctx.params;
    return NextResponse.json(await getRequestDetail(db, actor, id));
  });
}
