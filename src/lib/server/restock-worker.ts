import { randomUUID } from "node:crypto";
import type { ListingSnapshot, RestockPlan, RestockTask, WorkerResult } from "@/lib/types";
import { restockDelaySeconds, systemStatus } from "./config";
import {
  activeTaskIds,
  acquireTaskLease,
  appendActivity,
  completeHandoff,
  getOrCreateHandoffRun,
  getTask,
  photoStorageRecord,
  recordObservation,
  recordPhotoEbayUpload,
  releaseTaskLease,
  renewTaskLease,
  scheduleHandoffRun,
  setTaskStatus,
  updateHandoffRun,
  type HandoffRun,
} from "./database";
import { fetchListing, reviseFixedPriceListing, reviseFixedPriceQuantity, reviseFixedPriceVariationQuantity, uploadImageToEbay } from "./ebay";
import { readStoredImage } from "./storage";
import { flushDiscordNotifications, queueWorkerDiscordUpdate } from "./discord";
import { saleTriggerState } from "./sale-trigger";

/**
 * A single-item copy with no photos is an "identical" copy: it keeps the live listing's
 * photos, and an empty condition note keeps the live condition note. Only price and
 * quantity change.
 */
export function effectiveCopyContent(copy: { photos: unknown[]; conditionDescription: string }, listing: ListingSnapshot) {
  const reusesListingPhotos = copy.photos.length === 0;
  const conditionDescription = copy.conditionDescription.trim() || (listing.conditionDescription ?? "").trim();
  return { reusesListingPhotos, conditionDescription, listingPictureUrls: listing.imageUrls };
}

export function buildRestockPlan(task: RestockTask, current = task.listing): RestockPlan {
  const blockers = [...current.unsupportedReasons];
  if (!task.variationKey && current.variations.length) blockers.push("This task has no selected variation");
  const variation = task.variationKey ? current.variations.find((candidate) => candidate.key === task.variationKey) : null;
  if (task.variationKey && !variation) blockers.push("The selected variation is no longer on eBay");
  const selected = variation ?? current;
  if (!task.queuedCopy) blockers.push("No next copy is queued");
  if (!task.variationKey && task.queuedCopy && task.queuedCopy.photos.length === 0 && current.imageUrls.length === 0) {
    blockers.push("The queued copy reuses the listing photos, but the listing has none");
  }
  if (!task.variationKey && task.queuedCopy && task.queuedCopy.photos.length > 0 && !task.queuedCopy.conditionDescription.trim()) {
    blockers.push("The queued copy needs a condition note");
  }
  const status = systemStatus();
  if (!status.liveWritesAuthorized) {
    blockers.push(status.liveWritesBlocker ?? "Live eBay writes are not authorized");
  }

  return {
    taskId: task.id,
    itemId: task.itemId,
    variationKey: task.variationKey,
    writeMode: status.writeMode,
    trigger: {
      armedQuantitySold: task.armedQuantitySold,
      currentQuantitySold: selected.quantitySold,
      currentQuantityAvailable: selected.quantityAvailable,
    },
    copy: task.queuedCopy
      ? {
          id: task.queuedCopy.id,
          internalReference: task.queuedCopy.internalReference,
          conditionId: task.queuedCopy.conditionId,
          conditionDescription: task.queuedCopy.conditionDescription,
          photoCount: task.queuedCopy.photos.length,
          targetPrice: task.queuedCopy.targetPrice,
        }
      : null,
    mutation: {
      uploadLocalPhotosToEps: !task.variationKey && Boolean(task.queuedCopy?.photos.length),
      replaceAllPictureUrls: !task.variationKey && Boolean(task.queuedCopy?.photos.length),
      reviseConditionDescription: !task.variationKey,
      revisePrice: task.queuedCopy?.targetPrice !== null && task.queuedCopy?.targetPrice !== undefined,
      verifyWhileAtZero: !task.variationKey,
      restoreAvailableQuantityTo: 1,
    },
    blockers,
  };
}

function priceMatches(actual: number | null, expected: number | null): boolean {
  return expected === null || (actual !== null && Math.round(actual * 100) === Math.round(expected * 100));
}

export function appliedCopyMatches(
  listing: ListingSnapshot,
  pictureUrls: string[],
  conditionDescription: string,
  conditionId: string | null,
  expectedAvailable = 1,
  targetPrice: number | null = null,
): boolean {
  if (listing.quantityAvailable !== expectedAvailable || pictureUrls.length === 0) return false;
  if (!priceMatches(listing.price, targetPrice)) return false;
  if (listing.imageUrls.length !== pictureUrls.length) return false;
  if (!pictureUrls.every((url, index) => listing.imageUrls[index] === url)) return false;
  if (listing.conditionDescription?.trim() !== conditionDescription.trim()) return false;
  return !conditionId || listing.conditionId === conditionId;
}

export async function stageAndPublishCopy(
  copy: {
    itemId: string;
    conditionId: string | null;
    conditionDescription: string;
    pictureUrls: string[];
    targetPrice: number | null;
    currency: string;
  },
  actions: {
    reviseListing: typeof reviseFixedPriceListing;
    readListing: typeof fetchListing;
    publishQuantity: typeof reviseFixedPriceQuantity;
    onStaged: () => void;
  },
): Promise<ListingSnapshot> {
  await actions.reviseListing({ ...copy, availableQuantity: 0 });
  const staged = await actions.readListing(copy.itemId);
  if (!appliedCopyMatches(staged, copy.pictureUrls, copy.conditionDescription, copy.conditionId, 0, copy.targetPrice)) {
    throw new Error("The listing did not match the queued photos, condition, and price while held at zero");
  }
  actions.onStaged();
  await actions.publishQuantity(copy.itemId, 1);
  const confirmed = await actions.readListing(copy.itemId);
  if (!appliedCopyMatches(confirmed, copy.pictureUrls, copy.conditionDescription, copy.conditionId, 1, copy.targetPrice)) {
    throw new Error("eBay accepted the revision but the quantity, photos, condition, or price did not match the queued copy");
  }
  return confirmed;
}

export function restockWindowDue(run: HandoffRun, at = new Date()): boolean {
  if (run.status !== "scheduled") return true;
  if (!run.executeAfter) return false;
  const scheduledTime = Date.parse(run.executeAfter);
  return Number.isFinite(scheduledTime) && at.getTime() >= scheduledTime;
}

function scheduleOrWaitForRestock(
  task: RestockTask,
  listing: ListingSnapshot,
  plan: RestockPlan,
  run: HandoffRun,
): WorkerResult | null {
  if (run.status === "scheduled") {
    if (restockWindowDue(run)) return null;
    setTaskStatus(task.id, "scheduled");
    return {
      taskId: task.id,
      action: "waiting_for_restock",
      message: "Waiting for the restock window",
      listing,
      plan,
      scheduledFor: run.executeAfter ?? undefined,
    };
  }
  if (!["created", "blocked", "dry_run"].includes(run.status)) return null;
  const delay = run.approvedAt
    ? restockDelaySeconds(15)
    : restockDelaySeconds(task.queuedCopy?.releaseDelaySeconds ?? task.restockDelaySeconds);
  const scheduledFor = new Date(Date.now() + delay * 1000).toISOString();
  if (!scheduleHandoffRun(run.id, scheduledFor)) return null;
  setTaskStatus(task.id, "scheduled");
  appendActivity({
    taskId: task.id,
    type: "restock_scheduled",
    level: "info",
    message: "Sale observed at zero; queued restock scheduled",
    details: { itemId: listing.itemId, scheduledFor, copyId: plan.copy?.id },
    dedupeKey: `restock-scheduled:${run.id}`,
  });
  return {
    taskId: task.id,
    action: "restock_scheduled",
    message: "Sale observed; restock scheduled",
    listing,
    plan,
    scheduledFor,
  };
}

/** Hold a sale's restock until the seller approves it, when the next copy asks for that. */
function approvalGate(task: RestockTask, listing: ListingSnapshot, plan: RestockPlan, run: HandoffRun): WorkerResult | null {
  if (!task.queuedCopy?.needsApproval || run.approvedAt) return null;
  if (run.status !== "awaiting_approval") updateHandoffRun(run.id, { status: "awaiting_approval", error: null });
  setTaskStatus(task.id, "awaiting_approval");
  appendActivity({
    taskId: task.id,
    type: "awaiting_approval",
    level: "info",
    message: `Sold. ${task.queuedCopy.internalReference} is ready and waiting for your OK.`,
    details: { copyId: task.queuedCopy.id },
    dedupeKey: `awaiting-approval:${run.id}`,
  });
  return { taskId: task.id, action: "awaiting_approval", message: "Waiting for your OK to put the next copy up", listing, plan };
}

async function announceRestocking(taskId: string, listing: ListingSnapshot, plan: RestockPlan): Promise<void> {
  try {
    queueWorkerDiscordUpdate({ taskId, action: "restocking", message: "Applying queued restock", listing, plan });
    await flushDiscordNotifications();
  } catch {
    // Discord delivery cannot stop the eBay handoff.
  }
}

async function processVariationTask(
  task: RestockTask,
  listing: ListingSnapshot,
  plan: RestockPlan,
  owner: string,
): Promise<WorkerResult> {
  const variation = listing.variations.find((candidate) => candidate.key === task.variationKey);
  if (!listing.supported || !variation) {
    const message = !variation ? "The selected variation is no longer on eBay" : listing.unsupportedReasons.join(". ");
    setTaskStatus(task.id, "attention", message);
    return { taskId: task.id, action: "skipped", message, listing, plan };
  }
  if (saleTriggerState(task.armedQuantitySold, variation.quantitySold, variation.quantityAvailable) === "waiting") {
    if (task.queuedCopy) setTaskStatus(task.id, "active");
    return {
      taskId: task.id,
      action: "waiting_for_sale",
      message: `Waiting for ${variation.label} sold count ${task.armedQuantitySold}`,
      listing,
      plan,
    };
  }
  const run = getOrCreateHandoffRun(task.id, variation.quantitySold);
  if (variation.quantityAvailable === 1 && run.status === "publishing" && task.queuedCopy && priceMatches(variation.price, task.queuedCopy.targetPrice)) {
    completeHandoff({ taskId: task.id, copyId: task.queuedCopy.id, runId: run.id, snapshot: listing });
    return { taskId: task.id, action: "restocked", message: "Confirmed the selected variation is available", listing, plan, remainingQueuedCopies: getTask(task.id)?.queuedCopies.length ?? 0 };
  }
  if (saleTriggerState(task.armedQuantitySold, variation.quantitySold, variation.quantityAvailable) === "available") {
    const message = "The selected variation is already available. Review before changing its quantity.";
    setTaskStatus(task.id, "attention", message);
    return { taskId: task.id, action: "skipped", message, listing, plan };
  }
  if (!task.queuedCopy) {
    const message = "Selected variation is at zero; no next copy is queued.";
    setTaskStatus(task.id, "attention", message);
    updateHandoffRun(run.id, { status: "blocked", error: message });
    appendActivity({ taskId: task.id, type: "safe_zero_hold", level: "warning", message, details: { variationKey: task.variationKey }, dedupeKey: `variation-safe-zero:${run.id}` });
    return { taskId: task.id, action: "held_at_zero", message, listing, plan };
  }
  if (((task.queuedCopy.targetPrice ?? variation.price) ?? 0) <= 0 || !variation.specifics.length) {
    const message = "Selected variation needs a valid eBay price and option values";
    setTaskStatus(task.id, "attention", message);
    return { taskId: task.id, action: "skipped", message, listing, plan };
  }
  const waitingOnSeller = approvalGate(task, listing, plan, run);
  if (waitingOnSeller) return waitingOnSeller;
  const status = systemStatus();
  if (!status.liveWritesAuthorized) {
    const message = `Dry-run ready: ${status.liveWritesBlocker ?? "live writes are blocked"}`;
    setTaskStatus(task.id, "dry_run_ready");
    updateHandoffRun(run.id, { status: "dry_run", error: null });
    appendActivity({ taskId: task.id, type: "dry_run_ready", level: "info", message, details: { variationKey: task.variationKey }, dedupeKey: `variation-dry-run:${run.id}` });
    return { taskId: task.id, action: "dry_run_ready", message, listing, plan };
  }
  const scheduled = scheduleOrWaitForRestock(task, listing, plan, run);
  if (scheduled) return scheduled;
  try {
    setTaskStatus(task.id, "processing");
    updateHandoffRun(run.id, { status: "publishing", error: null });
    await announceRestocking(task.id, listing, plan);
    renewTaskLease(task.id, owner);
    await reviseFixedPriceVariationQuantity(listing.itemId, variation, 1, task.queuedCopy.targetPrice);
    const confirmed = await fetchListing(listing.itemId);
    const confirmedVariation = confirmed.variations.find((candidate) => candidate.key === task.variationKey);
    if (!confirmedVariation || confirmedVariation.quantityAvailable !== 1 || confirmedVariation.quantitySold !== variation.quantitySold || !priceMatches(confirmedVariation.price, task.queuedCopy.targetPrice)) {
      throw new Error("eBay did not confirm one available unit at the queued price for the selected variation");
    }
    completeHandoff({ taskId: task.id, copyId: task.queuedCopy.id, runId: run.id, snapshot: confirmed });
    appendActivity({ taskId: task.id, type: "variation_restock_confirmed", level: "success", message: `Restocked ${variation.label} with existing eBay photos`, details: { variationKey: task.variationKey, quantitySold: variation.quantitySold }, dedupeKey: `variation-restock:${run.id}` });
    return { taskId: task.id, action: "restocked", message: "Selected variation restocked with its existing eBay photos", listing: confirmed, plan, remainingQueuedCopies: getTask(task.id)?.queuedCopies.length ?? 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Variation restock failed";
    setTaskStatus(task.id, "error", message);
    updateHandoffRun(run.id, { status: "failed", error: message });
    appendActivity({ taskId: task.id, type: "restock_failed", level: "error", message, details: { variationKey: task.variationKey }, dedupeKey: `variation-error:${run.id}:${message}` });
    return { taskId: task.id, action: "failed", message, listing, plan };
  }
}

export async function processTask(taskId: string): Promise<WorkerResult> {
  const task = getTask(taskId);
  if (!task) throw new Error(`Restock task ${taskId} was not found`);
  const owner = randomUUID();
  if (!acquireTaskLease(taskId, owner)) {
    return {
      taskId,
      action: "skipped",
      message: "Another check is already processing this restock task",
      listing: task.listing,
    };
  }
  try {
    const result = await processTaskWithLease(taskId, owner);
    if (result.plan && ["restock_scheduled", "held_at_zero", "dry_run_ready"].includes(result.action)) {
      result.trigger = {
        kind: task.lastSeenQuantitySold < result.plan.trigger.currentQuantitySold ? "new_sale" : "already_at_zero",
        previousSold: task.lastSeenQuantitySold,
        previousAvailable: task.lastSeenQuantityAvailable,
      };
    }
    try {
      queueWorkerDiscordUpdate(result);
      await flushDiscordNotifications();
    } catch {
      // Discord is optional and cannot block an eBay handoff.
    }
    return result;
  } finally {
    releaseTaskLease(taskId, owner);
  }
}

async function processTaskWithLease(taskId: string, owner: string): Promise<WorkerResult> {
  const task = getTask(taskId);
  if (!task) throw new Error(`Restock task ${taskId} was not found`);
  const listing = await fetchListing(task.itemId);
  recordObservation(task.id, listing);
  const refreshedTask = getTask(task.id) ?? task;
  const plan = buildRestockPlan(refreshedTask, listing);
  if (task.variationKey) {
    return processVariationTask(refreshedTask, listing, plan, owner);
  }
  if (listing.variations.length) {
    const message = "This task has no selected variation; create a task for the specific option";
    setTaskStatus(task.id, "attention", message);
    return { taskId, action: "skipped", message, listing, plan };
  }

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

  if (saleTriggerState(refreshedTask.armedQuantitySold, listing.quantitySold, listing.quantityAvailable) === "waiting") {
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
    ["revising", "publishing", "failed"].includes(run.status) &&
    refreshedTask.queuedCopy &&
    appliedCopyMatches(
      listing,
      run.ebayPictureUrls,
      effectiveCopyContent(refreshedTask.queuedCopy, listing).conditionDescription,
      refreshedTask.queuedCopy.conditionId,
      1,
      refreshedTask.queuedCopy.targetPrice,
    )
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
      remainingQueuedCopies: getTask(task.id)?.queuedCopies.length ?? 0,
    };
  }

  if (saleTriggerState(refreshedTask.armedQuantitySold, listing.quantitySold, listing.quantityAvailable) === "available") {
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

  const content = refreshedTask.queuedCopy ? effectiveCopyContent(refreshedTask.queuedCopy, listing) : null;
  if (
    !refreshedTask.queuedCopy || !content ||
    (content.reusesListingPhotos ? content.listingPictureUrls.length === 0 : !refreshedTask.queuedCopy.conditionDescription.trim())
  ) {
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

  const waitingOnSeller = approvalGate(refreshedTask, listing, plan, run);
  if (waitingOnSeller) return waitingOnSeller;

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

  const scheduled = scheduleOrWaitForRestock(refreshedTask, listing, plan, run);
  if (scheduled) return scheduled;

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
    await announceRestocking(task.id, listing, plan);
    const pictureUrls: string[] = content.reusesListingPhotos ? [...content.listingPictureUrls] : [];
    for (const photo of refreshedTask.queuedCopy.photos) {
      renewTaskLease(taskId, owner);
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
    renewTaskLease(taskId, owner);
    const confirmed = await stageAndPublishCopy({
      itemId: listing.itemId,
      conditionId: refreshedTask.queuedCopy.conditionId,
      conditionDescription: content.conditionDescription,
      pictureUrls,
      targetPrice: refreshedTask.queuedCopy.targetPrice,
      currency: listing.currency,
    }, {
      reviseListing: reviseFixedPriceListing,
      readListing: fetchListing,
      publishQuantity: reviseFixedPriceQuantity,
      onStaged: () => {
        renewTaskLease(taskId, owner);
        updateHandoffRun(run.id, {
          status: "publishing",
          ebayPictureUrls: pictureUrls,
          error: null,
        });
      },
    });
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
      remainingQueuedCopies: getTask(task.id)?.queuedCopies.length ?? 0,
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
        const result: WorkerResult = {
          taskId,
          action: "failed",
          message,
          listing: task.listing,
        };
        results.push(result);
        try {
          queueWorkerDiscordUpdate(result);
          await flushDiscordNotifications();
        } catch {
          // Discord delivery cannot stop the worker.
        }
      }
    }
  }
  return results;
}
