import { NextResponse } from "next/server";
import { processTask } from "@/lib/server/restock-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await context.params;
    const result = await processTask(taskId);
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not check the restock task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
