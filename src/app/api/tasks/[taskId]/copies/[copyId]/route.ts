import { NextResponse } from "next/server";
import { moveQueuedCopy, removeQueuedCopy, updateQueuedCopyDetails, updateQueuedCopyPrice } from "@/lib/server/database";
import { parseTargetPrice } from "@/lib/server/price";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ taskId: string; copyId: string }> };

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = /not found/i.test(message) ? 404 : /locked|in use|current restock|wait for/i.test(message) ? 409 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(request: Request, context: Params) {
  try {
    const { taskId, copyId } = await context.params;
    const body = await request.json() as {
      action?: string; targetPrice?: string | null; direction?: string;
      internalReference?: string; conditionDescription?: string;
    };
    const task = body.action === "price"
      ? updateQueuedCopyPrice(taskId, copyId, parseTargetPrice(body.targetPrice ?? null))
      : body.action === "move" && (body.direction === "up" || body.direction === "down")
        ? moveQueuedCopy(taskId, copyId, body.direction)
        : body.action === "details"
          ? updateQueuedCopyDetails(taskId, copyId, {
            internalReference: typeof body.internalReference === "string" ? body.internalReference : undefined,
            conditionDescription: typeof body.conditionDescription === "string" ? body.conditionDescription : undefined,
          })
          : null;
    if (!task) return NextResponse.json({ error: "Invalid queue action" }, { status: 400 });
    return NextResponse.json({ task });
  } catch (error) {
    return errorResponse(error, "Could not update the queue");
  }
}

export async function DELETE(_request: Request, context: Params) {
  try {
    const { taskId, copyId } = await context.params;
    return NextResponse.json({ task: removeQueuedCopy(taskId, copyId) });
  } catch (error) {
    return errorResponse(error, "Could not remove the copy");
  }
}
