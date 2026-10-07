import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { MAX_QUEUED_COPIES, addQueuedCopy, getTask } from "@/lib/server/database";
import { fetchListing } from "@/lib/server/ebay";
import { storeTaskImages } from "@/lib/server/storage";
import { parseTargetPrice } from "@/lib/server/price";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Queue copies. With photos: one distinct copy (condition note required on single listings).
 * Without photos: `count` identical copies that reuse the live listing photos; optional
 * `prices` (JSON array, one per copy) lets a price rule set each restock price.
 */
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
    const files = form.getAll("photos").filter((value): value is File => value instanceof File);
    const count = files.length ? 1 : Math.trunc(Number(form.get("count") ?? 1));
    const rawDelay = form.get("releaseDelaySeconds");
    const releaseDelaySeconds = rawDelay === null || rawDelay === "" ? null : Number(rawDelay);
    const needsApproval = form.get("needsApproval") === "true";
    const startIndex = form.get("startIndex") === null ? null : Math.max(1, Math.trunc(Number(form.get("startIndex"))) || 1);
    if (!internalReference) {
      return NextResponse.json({ error: "Add a reference for this copy" }, { status: 400 });
    }
    if (!Number.isFinite(count) || count < 1 || count > 50) {
      return NextResponse.json({ error: "Add between 1 and 50 copies at a time" }, { status: 400 });
    }
    if (current.queuedCopies.length + count > MAX_QUEUED_COPIES) {
      return NextResponse.json({ error: `A listing can line up at most ${MAX_QUEUED_COPIES} copies` }, { status: 400 });
    }
    if (!current.variationKey && files.length && !conditionDescription) {
      return NextResponse.json({ error: "Add the condition note for this copy" }, { status: 400 });
    }
    let prices: Array<number | null>;
    const rawPrices = form.get("prices");
    if (rawPrices) {
      const parsed = JSON.parse(String(rawPrices)) as unknown;
      if (!Array.isArray(parsed) || parsed.length !== count) {
        return NextResponse.json({ error: "Send one price per copy" }, { status: 400 });
      }
      prices = parsed.map((value) => parseTargetPrice(value === null ? null : String(value)));
    } else {
      const single = parseTargetPrice(form.get("targetPrice"));
      prices = Array.from({ length: count }, () => single);
    }

    const listing = await fetchListing(current.itemId);
    if (!listing.supported) {
      return NextResponse.json({ error: listing.unsupportedReasons.join(". ") }, { status: 422 });
    }
    if (!current.variationKey && !files.length && !listing.imageUrls.length) {
      return NextResponse.json({ error: "This listing has no photos to reuse. Add photos for this copy." }, { status: 400 });
    }
    let task = current;
    for (let index = 0; index < count; index += 1) {
      const copyId = randomUUID();
      const images = files.length ? await storeTaskImages(taskId, copyId, files) : [];
      task = addQueuedCopy({
        taskId,
        copyId,
        snapshot: listing,
        internalReference: count > 1 || startIndex !== null ? `${internalReference}-${(startIndex ?? 1) + index}`.slice(0, 100) : internalReference,
        conditionDescription,
        targetPrice: prices[index],
        releaseDelaySeconds: releaseDelaySeconds !== null && Number.isFinite(releaseDelaySeconds) ? releaseDelaySeconds : null,
        needsApproval,
        grade: String(form.get("grade") ?? "") || null,
        images,
      });
    }
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not queue the copy";
    return NextResponse.json({ error: message }, { status: /price|JSON/i.test(message) ? 400 : 500 });
  }
}
