import { NextResponse } from "next/server";
import { updateTask, setTaskPaused } from "@/lib/server/database";
import { resolveHandoff } from "@/lib/server/restock-worker";
import { parseTargetPrice } from "@/lib/server/price";
import type { PriceRule } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Task-level edits: { restockDelaySeconds }, { priceRule }, { order: copyId[] },
 * { prices: [{ copyId, targetPrice }] }. Any combination may be sent together.
 */
export async function PATCH(request: Request, context: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await context.params;
    const body = await request.json() as {
      action?: string; runId?: string; copyId?: string; reviewed?: boolean;
      restockDelaySeconds?: number | null;
      priceRule?: PriceRule | null;
      order?: string[];
      prices?: Array<{ copyId: string; targetPrice: string | number | null }>;
    };
    if (body.action) {
      const task = body.action === "pause" || body.action === "resume" ? setTaskPaused(taskId, body.action === "pause")
        : (body.action === "sold" || body.action === "retry") && typeof body.runId === "string"
          ? await resolveHandoff(taskId, body.runId, body.action, body.reviewed === true, body.copyId) : null;
      return task ? NextResponse.json({ task }) : NextResponse.json({ error: "Invalid task action" }, { status: 400 });
    }
    const task = updateTask(taskId, {
      restockDelaySeconds: body.restockDelaySeconds, priceRule: body.priceRule,
      order: Array.isArray(body.order) ? body.order.map(String) : undefined,
      prices: Array.isArray(body.prices) ? body.prices.map((entry) => ({
        copyId: String(entry.copyId), targetPrice: parseTargetPrice(entry.targetPrice === null ? null : String(entry.targetPrice)),
      })) : undefined,
    });
    return NextResponse.json({ task });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update the task";
    const status = /not found/i.test(message) ? 404 : /locked|changed|wait for/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
