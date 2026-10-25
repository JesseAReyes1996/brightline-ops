import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/src/lib/db";
import { changeStatus } from "@/src/lib/services/requests";
import { parseInput, statusChangeSchema } from "@/src/lib/validation";
import { handle, readJson, requireUser } from "@/app/api/_lib/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/requests/[id]/status">) {
  return handle(async () => {
    const db = await getDb();
    const actor = await requireUser(req, db);
    const { id } = await ctx.params;
    const input = parseInput(statusChangeSchema, await readJson(req));
    return NextResponse.json(await changeStatus(db, actor, id, input));
  });
}
