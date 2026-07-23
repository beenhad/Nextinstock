import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { addQueuedCopy, getTask } from "@/lib/server/database";
import { fetchListing } from "@/lib/server/ebay";
import { storeTaskImages } from "@/lib/server/storage";

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
    if (current.queuedCopy) {
      return NextResponse.json({ error: "This task already has a queued copy" }, { status: 409 });
    }

    const form = await request.formData();
    const internalReference = String(form.get("internalReference") ?? "").trim().slice(0, 100);
    const conditionDescription = String(form.get("conditionDescription") ?? "").trim().slice(0, 1000);
    const files = form.getAll("photos").filter((value): value is File => value instanceof File);
    if (!internalReference) {
      return NextResponse.json({ error: "Add an internal copy reference" }, { status: 400 });
    }
    if (!conditionDescription) {
      return NextResponse.json({ error: "Add the exact condition note" }, { status: 400 });
    }

    const listing = await fetchListing(current.itemId);
    if (!listing.supported) {
      return NextResponse.json({ error: listing.unsupportedReasons.join(". ") }, { status: 422 });
    }
    const copyId = randomUUID();
    const images = await storeTaskImages(taskId, copyId, files);
    const task = addQueuedCopy({
      taskId,
      copyId,
      snapshot: listing,
      internalReference,
      conditionDescription,
      images,
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not queue the next copy";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
