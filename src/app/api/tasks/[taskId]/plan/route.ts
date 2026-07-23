import { NextResponse } from "next/server";
import { getTask } from "@/lib/server/database";
import { buildRestockPlan } from "@/lib/server/restock-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await context.params;
  const task = getTask(taskId);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ plan: buildRestockPlan(task) });
}
