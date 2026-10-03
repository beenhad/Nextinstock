import { NextResponse } from "next/server";
import { moveQueuedCopy, updateQueuedCopyPrice } from "@/lib/server/database";
import { parseTargetPrice } from "@/lib/server/price";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ taskId: string; copyId: string }> },
) {
  try {
    const { taskId, copyId } = await context.params;
    const body = await request.json() as { action?: string; targetPrice?: string | null; direction?: string };
    const task = body.action === "price"
      ? updateQueuedCopyPrice(taskId, copyId, parseTargetPrice(body.targetPrice ?? null))
      : body.action === "move" && (body.direction === "up" || body.direction === "down")
        ? moveQueuedCopy(taskId, copyId, body.direction)
        : null;
    if (!task) return NextResponse.json({ error: "Invalid queue action" }, { status: 400 });
    return NextResponse.json({ task });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update the queue";
    const status = /not found/i.test(message) ? 404 : /locked|in use|current restock/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
