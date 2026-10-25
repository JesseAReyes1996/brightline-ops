import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/src/lib/db";
import { assignRequest } from "@/src/lib/services/requests";
import { assignSchema, parseInput } from "@/src/lib/validation";
import { handle, readJson, requireUser } from "@/app/api/_lib/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/requests/[id]/assign">) {
  return handle(async () => {
    const db = await getDb();
    const actor = await requireUser(req, db);
    const { id } = await ctx.params;
    const input = parseInput(assignSchema, await readJson(req));
    return NextResponse.json(await assignRequest(db, actor, id, input));
  });
}
