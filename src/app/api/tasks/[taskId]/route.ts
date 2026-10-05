import { NextResponse } from "next/server";
import { reorderQueuedCopies, setQueuedCopyPrices, updateTaskSettings } from "@/lib/server/database";
import { parseTargetPrice } from "@/lib/server/price";
import type { PriceRule, RestockTask } from "@/lib/types";

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
      restockDelaySeconds?: number | null;
      priceRule?: PriceRule | null;
      order?: string[];
      prices?: Array<{ copyId: string; targetPrice: string | number | null }>;
    };
    let task: RestockTask | null = null;
    if (body.restockDelaySeconds !== undefined || body.priceRule !== undefined) {
      task = updateTaskSettings(taskId, { restockDelaySeconds: body.restockDelaySeconds, priceRule: body.priceRule });
    }
    if (Array.isArray(body.order)) task = reorderQueuedCopies(taskId, body.order.map(String));
    if (Array.isArray(body.prices)) {
      task = setQueuedCopyPrices(taskId, body.prices.map((entry) => ({
        copyId: String(entry.copyId),
        targetPrice: parseTargetPrice(entry.targetPrice === null ? null : String(entry.targetPrice)),
      })));
    }
    if (!task) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    return NextResponse.json({ task });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update the task";
    const status = /not found/i.test(message) ? 404 : /locked|changed|wait for/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
