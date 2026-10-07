import { NextResponse } from "next/server";
import { approveHandoffRun, getTask } from "@/lib/server/database";
import { processTask } from "@/lib/server/restock-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Approve the restock that is waiting on the seller, then let the worker pick it up right away. */
export async function POST(_request: Request, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  if (!getTask(taskId)) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  if (!approveHandoffRun(taskId)) return NextResponse.json({ error: "Nothing is waiting for your OK on this listing" }, { status: 409 });
  try {
    const result = await processTask(taskId);
    return NextResponse.json({ approved: true, result, task: getTask(taskId) });
  } catch (error) {
    return NextResponse.json({ approved: true, error: error instanceof Error ? error.message : "Approved, but the check failed", task: getTask(taskId) });
  }
}
