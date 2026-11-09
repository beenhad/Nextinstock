import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createTask, listTasks, replayCopyRequest, photoStorageKeyInUse } from "@/lib/server/database";
import { fetchListing } from "@/lib/server/ebay";
import { storeTaskImages, removeStoredImages, type StoredImage } from "@/lib/server/storage";
import { copyRequest } from "@/lib/server/copy-request";
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
  let images: StoredImage[] = [];
  let committed = false;
  let requestIdentity: Awaited<ReturnType<typeof copyRequest>>;
  try {
    const form = await request.formData();
    requestIdentity = await copyRequest(form);
    const replay = requestIdentity && replayCopyRequest(requestIdentity.id, requestIdentity.fingerprint);
    if (replay) return NextResponse.json({ task: replay }, { status: 201 });
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
      const task = createTask({ taskId: randomUUID(), copyId: null, snapshot: listing, variationKey, internalReference: "", conditionDescription: "", images: [], request: requestIdentity });
      committed = true;
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
    images = files.length ? await storeTaskImages(taskId, copyId, files) : [];
    const task = createTask({
      taskId,
      copyId,
      snapshot: listing,
      variationKey,
      internalReference,
      conditionDescription,
      targetPrice,
      images,
      request: requestIdentity,
    });
    committed = true;
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    if (!committed) {
      try { removeStoredImages(images.filter((image) => !photoStorageKeyInUse(image.storageKey))); }
      catch { console.error("Could not clean uncommitted photos; preserved files for review"); }
      // Concurrent replay can lose the receipt insert race after writing files.
      if (requestIdentity) {
        try { const replay = replayCopyRequest(requestIdentity.id, requestIdentity.fingerprint); if (replay) return NextResponse.json({ task: replay }, { status: 201 }); }
        catch { /* Return the original conflict below. */ }
      }
    }
    const message = error instanceof Error ? error.message : "Could not create the restock task";
    const conflict = message.includes("already exists");
    return NextResponse.json({ error: message }, { status: conflict ? 409 : /locked|restock check|already saved|UNIQUE/.test(message) ? 409 : /price|Invalid copy request|Each photo|at most|between|not a supported image|pixels|readable image|valid eBay item/.test(message) ? 400 : 500 });
  }
}
