import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { addQueuedCopy, getTask } from "@/lib/server/database";
import { fetchListing } from "@/lib/server/ebay";
import { storeTaskImages } from "@/lib/server/storage";
import { parseTargetPrice } from "@/lib/server/price";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await context.params;
    const current = getTask(taskId);
    if (!current) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    const form = await request.formData();
    const internalReference = String(form.get("internalReference") ?? "").trim().slice(0, 100);
    const conditionDescription = String(form.get("conditionDescription") ?? "").trim().slice(0, 1000);
    const targetPrice = parseTargetPrice(form.get("targetPrice"));
    const files = form.getAll("photos").filter((value): value is File => value instanceof File);
    if (!internalReference) {
      return NextResponse.json({ error: "Add an internal copy reference" }, { status: 400 });
    }
    if (!current.variationKey && !conditionDescription) {
      return NextResponse.json({ error: "Add the exact condition note" }, { status: 400 });
    }
    if (!current.variationKey && !files.length) {
      return NextResponse.json({ error: "Add at least one photo" }, { status: 400 });
    }

    const listing = await fetchListing(current.itemId);
    if (!listing.supported) {
      return NextResponse.json({ error: listing.unsupportedReasons.join(". ") }, { status: 422 });
    }
    const copyId = randomUUID();
    const images = files.length ? await storeTaskImages(taskId, copyId, files) : [];
    const task = addQueuedCopy({
      taskId,
      copyId,
      snapshot: listing,
      internalReference,
      conditionDescription,
      targetPrice,
      images,
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not queue the next copy";
    return NextResponse.json({ error: message }, { status: message.includes("price") ? 400 : 500 });
  }
}
