import type { RestockPlan, RestockTask, WorkerResult } from "@/lib/types";
import { systemStatus } from "./config";
import {
  activeTaskIds,
  appendActivity,
  completeHandoff,
  getOrCreateHandoffRun,
  getTask,
  photoStorageRecord,
  recordObservation,
  recordPhotoEbayUpload,
  setTaskStatus,
  updateHandoffRun,
} from "./database";
import { fetchListing, reviseFixedPriceListing, uploadImageToEbay } from "./ebay";
import { readStoredImage } from "./storage";

export function buildRestockPlan(task: RestockTask, current = task.listing): RestockPlan {
  const blockers = [...current.unsupportedReasons];
  if (!task.queuedCopy) blockers.push("No next copy is queued");
  if (task.queuedCopy && task.queuedCopy.photos.length === 0) {
    blockers.push("The queued copy has no photos");
  }
  if (!task.queuedCopy?.conditionDescription.trim()) {
    blockers.push("The queued copy needs a condition note");
  }
  const status = systemStatus();
  if (!status.liveWritesAuthorized) {
    blockers.push(status.liveWritesBlocker ?? "Live eBay writes are not authorized");
  }

  return {
    taskId: task.id,
    itemId: task.itemId,
    writeMode: status.writeMode,
    trigger: {
      armedQuantitySold: task.armedQuantitySold,
      currentQuantitySold: current.quantitySold,
      currentQuantityAvailable: current.quantityAvailable,
    },
    copy: task.queuedCopy
      ? {
          id: task.queuedCopy.id,
          internalReference: task.queuedCopy.internalReference,
          conditionId: task.queuedCopy.conditionId,
          conditionDescription: task.queuedCopy.conditionDescription,
          photoCount: task.queuedCopy.photos.length,
        }
      : null,
    mutation: {
      uploadLocalPhotosToEps: true,
      replaceAllPictureUrls: true,
      reviseConditionDescription: true,
      restoreAvailableQuantityTo: 1,
    },
    blockers,
  };
}

function picturesMatch(current: string[], expected: string[]): boolean {
  if (current.length !== expected.length || expected.length === 0) return false;
  return expected.every((url) => current.includes(url));
}

export async function processTask(taskId: string): Promise<WorkerResult> {
  const task = getTask(taskId);
  if (!task) throw new Error(`Restock task ${taskId} was not found`);
  const listing = await fetchListing(task.itemId);
  recordObservation(task.id, listing);
  const refreshedTask = getTask(task.id) ?? task;
  const plan = buildRestockPlan(refreshedTask, listing);

  if (!listing.supported) {
    const message = listing.unsupportedReasons.join(". ");
    setTaskStatus(task.id, "attention", message);
    appendActivity({
      taskId: task.id,
      type: "listing_unsupported",
      level: "warning",
      message,
      details: { itemId: listing.itemId, reasons: listing.unsupportedReasons },
      dedupeKey: `unsupported:${task.id}:${listing.unsupportedReasons.join("|")}`,
    });
    return { taskId, action: "skipped", message, listing, plan };
  }

  if (listing.quantitySold < refreshedTask.armedQuantitySold) {
    if (refreshedTask.queuedCopy) setTaskStatus(task.id, "active");
    return {
      taskId,
      action: "waiting_for_sale",
      message: `Waiting for sold count ${refreshedTask.armedQuantitySold}`,
      listing,
      plan,
    };
  }

  const run = getOrCreateHandoffRun(task.id, listing.quantitySold);
  if (
    listing.quantityAvailable > 0 &&
    ["revising", "failed"].includes(run.status) &&
    picturesMatch(listing.imageUrls, run.ebayPictureUrls) &&
    refreshedTask.queuedCopy
  ) {
    completeHandoff({
      taskId: task.id,
      copyId: refreshedTask.queuedCopy.id,
      runId: run.id,
      snapshot: listing,
    });
    return {
      taskId,
      action: "restocked",
      message: "Recovered and confirmed a previously applied restock",
      listing,
      plan,
    };
  }

  if (listing.quantityAvailable > 0) {
    const message =
      "The trigger sale was observed, but the listing is already available. Review before changing it.";
    setTaskStatus(task.id, "attention", message);
    appendActivity({
      taskId: task.id,
      type: "listing_changed_outside_nextinstock",
      level: "warning",
      message,
      details: {
        itemId: listing.itemId,
        quantitySold: listing.quantitySold,
        quantityAvailable: listing.quantityAvailable,
      },
      dedupeKey: `external-change:${task.id}:${listing.quantitySold}`,
    });
    return { taskId, action: "skipped", message, listing, plan };
  }

  if (!refreshedTask.queuedCopy || refreshedTask.queuedCopy.photos.length === 0) {
    const message = "Listing is held safely at zero because no complete next copy is queued.";
    setTaskStatus(task.id, "attention", message);
    updateHandoffRun(run.id, { status: "blocked", error: message });
    appendActivity({
      taskId: task.id,
      type: "safe_zero_hold",
      level: "warning",
      message,
      details: { itemId: listing.itemId, quantitySold: listing.quantitySold },
      dedupeKey: `safe-zero:${task.id}:${listing.quantitySold}`,
    });
    return { taskId, action: "held_at_zero", message, listing, plan };
  }

  const status = systemStatus();
  if (!status.liveWritesAuthorized) {
    const message = `Dry-run ready: ${status.liveWritesBlocker ?? "live writes are blocked"}`;
    setTaskStatus(task.id, "dry_run_ready");
    updateHandoffRun(run.id, { status: "dry_run", error: null });
    appendActivity({
      taskId: task.id,
      type: "dry_run_ready",
      level: "info",
      message,
      details: plan as unknown as Record<string, unknown>,
      dedupeKey: `dry-run:${task.id}:${listing.quantitySold}`,
    });
    return { taskId, action: "dry_run_ready", message, listing, plan };
  }

  setTaskStatus(task.id, "processing");
  updateHandoffRun(run.id, { status: "uploading", error: null });
  appendActivity({
    taskId: task.id,
    type: "restock_started",
    level: "info",
    message: "Sale detected; listing remains at zero while the queued copy is applied",
    details: { itemId: listing.itemId, quantitySold: listing.quantitySold },
    dedupeKey: `restock-start:${run.id}`,
  });

  try {
    const pictureUrls: string[] = [];
    for (const photo of refreshedTask.queuedCopy.photos) {
      if (photo.ebayImageUrl && photo.ebayImageId) {
        pictureUrls.push(photo.ebayImageUrl);
        continue;
      }
      const storageRecord = photoStorageRecord(photo.id);
      if (!storageRecord) throw new Error(`Local photo ${photo.id} is missing`);
      const upload = await uploadImageToEbay({
        buffer: readStoredImage(storageRecord.storageKey),
        filename: photo.originalName.replace(/\.[^.]+$/, "") + ".jpg",
        mimeType: storageRecord.mimeType,
      });
      recordPhotoEbayUpload(photo.id, upload.imageId, upload.imageUrl);
      pictureUrls.push(upload.imageUrl);
    }

    updateHandoffRun(run.id, { status: "revising", ebayPictureUrls: pictureUrls, error: null });
    await reviseFixedPriceListing({
      itemId: listing.itemId,
      conditionId: refreshedTask.queuedCopy.conditionId,
      conditionDescription: refreshedTask.queuedCopy.conditionDescription,
      pictureUrls,
      availableQuantity: 1,
    });
    const confirmed = await fetchListing(listing.itemId);
    if (confirmed.quantityAvailable < 1) {
      throw new Error("eBay accepted the revision but quantity did not return to one");
    }
    completeHandoff({
      taskId: task.id,
      copyId: refreshedTask.queuedCopy.id,
      runId: run.id,
      snapshot: confirmed,
    });
    return {
      taskId,
      action: "restocked",
      message: "Queued copy is live on the original eBay listing",
      listing: confirmed,
      plan,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown restock failure";
    const recoveryMessage =
      "Restock could not be confirmed. Nextinstock will recheck eBay before issuing another revision.";
    setTaskStatus(task.id, "error", message);
    updateHandoffRun(run.id, { status: "failed", error: message });
    appendActivity({
      taskId: task.id,
      type: "restock_failed",
      level: "error",
      message: `${recoveryMessage} ${message}`,
      details: {
        itemId: listing.itemId,
        runId: run.id,
        observedQuantityAvailable: listing.quantityAvailable,
      },
      dedupeKey: `restock-failed:${run.id}:${message}`,
    });
    return {
      taskId,
      action: "failed",
      message: `${recoveryMessage} ${message}`,
      listing,
      plan,
    };
  }
}

export async function processAllTasks(): Promise<WorkerResult[]> {
  const results: WorkerResult[] = [];
  for (const taskId of activeTaskIds()) {
    try {
      results.push(await processTask(taskId));
    } catch (error) {
      const task = getTask(taskId);
      const message = error instanceof Error ? error.message : "Unknown worker error";
      if (task) {
        setTaskStatus(taskId, "error", message);
        appendActivity({
          taskId,
          type: "worker_error",
          level: "error",
          message,
          details: { itemId: task.itemId },
        });
        results.push({
          taskId,
          action: "failed",
          message,
          listing: task.listing,
        });
      }
    }
  }
  return results;
}
