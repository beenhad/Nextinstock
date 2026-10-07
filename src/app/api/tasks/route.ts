import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createTask, listTasks } from "@/lib/server/database";
import { fetchListing } from "@/lib/server/ebay";
import { storeTaskImages } from "@/lib/server/storage";
import { parseTargetPrice } from "@/lib/server/price";

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
    const variationKey = String(form.get("variationKey") ?? "").trim() || null;
    const internalReference = String(form.get("internalReference") ?? "").trim().slice(0, 100);
    const conditionDescription = String(form.get("conditionDescription") ?? "").trim().slice(0, 1000);
    const targetPrice = parseTargetPrice(form.get("targetPrice"));
    const files = form.getAll("photos").filter((value): value is File => value instanceof File);

    const startEmpty = form.get("startEmpty") === "true";
    if (!startEmpty && !internalReference) {
      return NextResponse.json({ error: "Add an internal copy reference" }, { status: 400 });
    }
    const listing = await fetchListing(itemId);
    if (!listing.supported) {
      return NextResponse.json(
        { error: listing.unsupportedReasons.join(". "), listing },
        { status: 422 },
      );
    }
    if (listing.variations.length && !listing.variations.some((variation) => variation.key === variationKey)) {
      return NextResponse.json({ error: "Select a valid variation" }, { status: 400 });
    }
    if (!listing.variations.length && variationKey) {
      return NextResponse.json({ error: "This listing has no variations" }, { status: 400 });
    }
    if (startEmpty) {
      const task = createTask({ taskId: randomUUID(), copyId: null, snapshot: listing, variationKey, internalReference: "", conditionDescription: "", images: [] });
      return NextResponse.json({ task }, { status: 201 });
    }
    if (!variationKey && files.length && !conditionDescription) {
      return NextResponse.json({ error: "Add the condition note for this copy" }, { status: 400 });
    }
    if (!variationKey && !files.length && !listing.imageUrls.length) {
      return NextResponse.json({ error: "This listing has no photos to reuse. Add photos for this copy." }, { status: 400 });
    }
    const taskId = randomUUID();
    const copyId = randomUUID();
    const images = files.length ? await storeTaskImages(taskId, copyId, files) : [];
    const task = createTask({
      taskId,
      copyId,
      snapshot: listing,
      variationKey,
      internalReference,
      conditionDescription,
      targetPrice,
      images,
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the restock task";
    const conflict = message.includes("already exists");
    return NextResponse.json({ error: message }, { status: conflict ? 409 : message.includes("price") ? 400 : 500 });
  }
}
