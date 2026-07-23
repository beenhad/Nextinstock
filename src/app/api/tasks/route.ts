import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createTask, listTasks } from "@/lib/server/database";
import { fetchListing } from "@/lib/server/ebay";
import { storeTaskImages } from "@/lib/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { tasks: listTasks() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const itemId = String(form.get("itemId") ?? "").trim();
    const internalReference = String(form.get("internalReference") ?? "").trim().slice(0, 100);
    const conditionDescription = String(form.get("conditionDescription") ?? "").trim().slice(0, 1000);
    const files = form.getAll("photos").filter((value): value is File => value instanceof File);

    if (!internalReference) {
      return NextResponse.json({ error: "Add an internal copy reference" }, { status: 400 });
    }
    if (!conditionDescription) {
      return NextResponse.json({ error: "Add the exact condition note for this copy" }, { status: 400 });
    }

    const listing = await fetchListing(itemId);
    if (!listing.supported) {
      return NextResponse.json(
        { error: listing.unsupportedReasons.join(". "), listing },
        { status: 422 },
      );
    }
    const taskId = randomUUID();
    const copyId = randomUUID();
    const images = await storeTaskImages(taskId, copyId, files);
    const task = createTask({
      taskId,
      copyId,
      snapshot: listing,
      internalReference,
      conditionDescription,
      images,
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the restock task";
    const conflict = message.includes("already exists");
    return NextResponse.json({ error: message }, { status: conflict ? 409 : 500 });
  }
}
