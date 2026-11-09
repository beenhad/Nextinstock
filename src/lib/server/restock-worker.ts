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
  getHandoffRun,
  pendingHandoffRun,
  pinHandoffCopy,
  refreshUnboundHandoff,
  bindReviewedLegacyHandoff,
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
import { publicationUncertain } from "./handoff-state";

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
  if (task.status === "paused") blockers.push("Task is paused");
  if (task.pendingHandoff && publicationUncertain(task.pendingHandoff.status)) blockers.push("Previous publication must be reconciled");
  if (!task.variationKey && current.variations.length) blockers.push("This task has no selected variation");
  const variation = task.variationKey ? current.variations.find((candidate) => candidate.key === task.variationKey) : null;
  if (task.variationKey && !variation) blockers.push("The selected variation is no longer on eBay");
  const selected = variation ?? current;
  if (!task.queuedCopy) blockers.push("No next copy is queued");
  if (!task.variationKey && task.queuedCopy && task.queuedCopy.photos.length === 0 && current.imageUrls.length === 0) {
    blockers.push("The queued copy reuses listing photos, but the listing has none");
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
    expectedQuantitySold?: number;
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
  if ((copy.expectedQuantitySold !== undefined && staged.quantitySold !== copy.expectedQuantitySold) || !appliedCopyMatches(staged, copy.pictureUrls, copy.conditionDescription, copy.conditionId, 0, copy.targetPrice)) {
    throw new Error("The listing did not match the queued photos, condition, and price while held at zero");
  }
  actions.onStaged();
  await actions.publishQuantity(copy.itemId, 1);
  const confirmed = await actions.readListing(copy.itemId);
  if ((copy.expectedQuantitySold !== undefined && confirmed.quantitySold !== copy.expectedQuantitySold) || !appliedCopyMatches(confirmed, copy.pictureUrls, copy.conditionDescription, copy.conditionId, 1, copy.targetPrice)) {
    throw new Error("eBay accepted the revision but the quantity, photos, condition, or price did not match the queued copy");
  }
  return confirmed;
}

export function restockWindowDue(run: HandoffRun, at = new Date()): boolean {
  return run.status === "scheduled" && Boolean(run.executeAfter) && Number.isFinite(Date.parse(run.executeAfter!)) && at.getTime() >= Date.parse(run.executeAfter!);
}

type WorkerActions = {
  readListing: typeof fetchListing;
  reviseListing: typeof reviseFixedPriceListing;
  publishQuantity: typeof reviseFixedPriceQuantity;
  publishVariation: typeof reviseFixedPriceVariationQuantity;
  uploadImage: typeof uploadImageToEbay;
  readImage: typeof readStoredImage;
  status: typeof systemStatus;
  notify: (result: WorkerResult) => Promise<void>;
};

const defaultActions: WorkerActions = {
  readListing: fetchListing, reviseListing: reviseFixedPriceListing, publishQuantity: reviseFixedPriceQuantity,
  publishVariation: reviseFixedPriceVariationQuantity, uploadImage: uploadImageToEbay, readImage: readStoredImage,
  status: systemStatus,
  notify: async (result) => { queueWorkerDiscordUpdate(result); await flushDiscordNotifications(); },
};

function selectedTarget(task: RestockTask, listing: ListingSnapshot) {
  return task.variationKey ? listing.variations.find((item) => item.key === task.variationKey) : listing;
}

function copyMatches(task: RestockTask, listing: ListingSnapshot, run: HandoffRun, available: number) {
  const target = selectedTarget(task, listing);
  const copy = task.queuedCopies.find((item) => item.id === run.copyId);
  if (!target || !copy || target.quantityAvailable !== available) return false;
  return task.variationKey ? priceMatches(target.price, copy.targetPrice)
    : appliedCopyMatches(listing, run.ebayPictureUrls, run.conditionDescription ?? effectiveCopyContent(copy, listing).conditionDescription, copy.conditionId, available, copy.targetPrice);
}

function holdForReconciliation(task: RestockTask, listing: ListingSnapshot, run: HandoffRun, plan: RestockPlan): WorkerResult {
  const message = "Publication is unconfirmed. Review this physical copy before retrying or marking it sold; automatic publication is blocked.";
  if (run.status === "publishing" || run.status === "scheduled" || run.status === "awaiting_approval") updateHandoffRun(run.id, { status: "reconciling", error: message });
  setTaskStatus(task.id, "reconciling", message);
  appendActivity({ taskId: task.id, type: "reconciliation_required", level: "warning", message, details: { runId: run.id, copyId: run.copyId }, dedupeKey: `reconcile:${run.id}` });
  return { taskId: task.id, action: "skipped", message, listing, plan };
}

export async function processTask(taskId: string, overrides: Partial<WorkerActions> = {}): Promise<WorkerResult> {
  const actions = { ...defaultActions, ...overrides };
  const task = getTask(taskId);
  if (!task) throw new Error(`Restock task ${taskId} was not found`);
  if (task.status === "paused") return { taskId, action: "skipped", message: "Task is paused", listing: task.listing };
  const owner = randomUUID();
  if (!acquireTaskLease(taskId, owner)) return { taskId, action: "skipped", message: "Another check is already processing this eBay item", listing: task.listing };
  try {
    const result = await processTaskWithLease(taskId, owner, actions);
    if (result.plan && ["restock_scheduled", "held_at_zero", "dry_run_ready", "awaiting_approval"].includes(result.action)) {
      result.trigger = { kind: task.lastSeenQuantitySold < result.plan.trigger.currentQuantitySold ? "new_sale" : "already_at_zero", previousSold: task.lastSeenQuantitySold, previousAvailable: task.lastSeenQuantityAvailable };
    }
    if (["held_at_zero", "dry_run_ready", "awaiting_approval", "skipped"].includes(result.action)) {
      appendActivity({ taskId, type: result.action === "held_at_zero" ? "safe_zero_hold" : result.action === "skipped" ? "task_attention" : result.action === "awaiting_approval" ? "awaiting_approval" : "dry_run_ready",
        level: result.action === "dry_run_ready" ? "info" : "warning", message: result.message,
        details: { plan: result.plan }, dedupeKey: `outcome:${taskId}:${result.plan?.trigger.currentQuantitySold}:${result.action}:${result.message}` });
    }
    try { await actions.notify(result); } catch { /* Notifications never block inventory work. */ }
    return result;
  } finally { releaseTaskLease(taskId, owner); }
}

async function processTaskWithLease(taskId: string, owner: string, actions: WorkerActions): Promise<WorkerResult> {
  const task = getTask(taskId)!;
  if (task.status === "paused") return { taskId, action: "skipped", message: "Task is paused", listing: task.listing };
  const listing = await actions.readListing(task.itemId);
  recordObservation(taskId, listing);
  const current = getTask(taskId)!;
  const plan = buildRestockPlan(current, listing);
  const target = selectedTarget(current, listing);
  let run = pendingHandoffRun(taskId);
  if (run && publicationUncertain(run.status)) {
    if (run.copyId && target?.quantitySold === run.triggerQuantitySold && copyMatches(current, listing, run, 1)) {
      renewTaskLease(taskId, owner);
      completeHandoff({ taskId, copyId: run.copyId, runId: run.id, snapshot: listing });
      return { taskId, action: "restocked", message: "Recovered and confirmed the published copy", listing, plan, remainingQueuedCopies: getTask(taskId)!.queuedCopies.length };
    }
    return holdForReconciliation(current, listing, run, plan);
  }
  if (!listing.supported || !target || (!task.variationKey && listing.variations.length)) {
    const message = !target ? "The selected variation is no longer on eBay" : listing.unsupportedReasons.join(". ") || "This task has no selected variation";
    setTaskStatus(taskId, "attention", message);
    return { taskId, action: "skipped", message, listing, plan };
  }
  if (run?.copyId && run.copyId !== current.queuedCopy?.id) return holdForReconciliation(current, listing, run, plan);
  const trigger = saleTriggerState(current.armedQuantitySold, target.quantitySold, target.quantityAvailable);
  if (trigger === "waiting") {
    if (current.queuedCopy) setTaskStatus(taskId, "active");
    return { taskId, action: "waiting_for_sale", message: `Waiting for sold count ${current.armedQuantitySold}`, listing, plan };
  }
  if (trigger === "available") {
    const message = "The target is already available. Review before changing it.";
    setTaskStatus(taskId, "attention", message);
    return { taskId, action: "skipped", message, listing, plan };
  }
  run ??= getOrCreateHandoffRun(taskId, target.quantitySold);
  if (!run.copyId && ["created", "blocked", "dry_run"].includes(run.status)) run = refreshUnboundHandoff(run.id, target.quantitySold);
  if (run.status === "completed") throw new Error("Completed handoff cannot be replayed");
  // A process interrupted before publishing may safely restage at zero, after a fresh hold.
  if (["uploading", "revising"].includes(run.status)) {
    updateHandoffRun(run.id, { status: "failed", error: "Interrupted before publication" });
    run = getHandoffRun(run.id);
  }
  if (run.copyId && target.quantitySold !== run.triggerQuantitySold) {
    setTaskStatus(taskId, "attention", "Sold count changed during the handoff; review the task");
    return { taskId, action: "skipped", message: "Sold count changed during the handoff; review the task", listing, plan };
  }
  const content = current.queuedCopy ? effectiveCopyContent(current.queuedCopy, listing) : null;
  if (!current.queuedCopy || (!task.variationKey && (!content || (content.reusesListingPhotos ? !content.listingPictureUrls.length : !current.queuedCopy.conditionDescription.trim())))) {
    const message = "Target held at zero because no complete next copy is queued";
    setTaskStatus(taskId, "attention", message);
    updateHandoffRun(run.id, { status: "blocked", error: message });
    return { taskId, action: "held_at_zero", message, listing, plan };
  }
  if (task.variationKey && (((current.queuedCopy.targetPrice ?? target.price) ?? 0) <= 0 || !("specifics" in target) || !target.specifics.length)) {
    const message = "Selected variation needs a valid price and option values";
    setTaskStatus(taskId, "attention", message);
    return { taskId, action: "skipped", message, listing, plan };
  }
  if (current.queuedCopy.needsApproval && !run.approvedAt) {
    pinHandoffCopy(run.id, current.queuedCopy.id);
    if (run.status !== "awaiting_approval") updateHandoffRun(run.id, { status: "awaiting_approval" });
    setTaskStatus(taskId, "awaiting_approval");
    return { taskId, action: "awaiting_approval", message: "Waiting for your OK to put the next copy up", listing, plan };
  }
  const status = actions.status();
  if (!status.liveWritesAuthorized) {
    const message = `Dry-run ready: ${status.liveWritesBlocker ?? "live writes are blocked"}`;
    setTaskStatus(taskId, "dry_run_ready");
    updateHandoffRun(run.id, { status: "dry_run" });
    return { taskId, action: "dry_run_ready", message, listing, plan };
  }
  if (run.status !== "scheduled") {
    const scheduledFor = new Date(Date.now() + restockDelaySeconds(run.approvedAt ? 15 : current.queuedCopy.releaseDelaySeconds ?? current.restockDelaySeconds) * 1000).toISOString();
    if (!scheduleHandoffRun(run.id, scheduledFor)) throw new Error("Could not schedule handoff");
    setTaskStatus(taskId, "scheduled");
    appendActivity({ taskId, type: "restock_scheduled", level: "info", message: "Queued restock scheduled", details: { scheduledFor, copyId: current.queuedCopy.id }, dedupeKey: `scheduled:${run.id}:${scheduledFor}` });
    return { taskId, action: "restock_scheduled", message: "Sale observed; restock scheduled", listing, plan, scheduledFor };
  }
  if (!restockWindowDue(run)) {
    if (!run.executeAfter || !Number.isFinite(Date.parse(run.executeAfter))) {
      updateHandoffRun(run.id, { status: "failed", error: "Invalid restock deadline" });
      setTaskStatus(taskId, "error", "Invalid restock deadline; the next check will schedule a fresh hold");
      return { taskId, action: "failed", message: "Invalid restock deadline", listing, plan };
    }
    setTaskStatus(taskId, "scheduled");
    return { taskId, action: "waiting_for_restock", message: "Waiting for the restock window", listing, plan, scheduledFor: run.executeAfter };
  }
  if (!run.copyId || current.queuedCopy.id !== run.copyId) throw new Error("Handoff has no verified copy identity");
  try {
    setTaskStatus(taskId, "processing");
    appendActivity({ taskId, type: "restock_started", level: "info", message: "Applying the pinned physical copy while the target is at zero", details: { runId: run.id, copyId: run.copyId }, dedupeKey: `started:${run.id}` });
    try { await actions.notify({ taskId, action: "restocking", message: "Applying queued copy", listing, plan }); } catch { /* Optional. */ }
    renewTaskLease(taskId, owner);
    const copy = current.queuedCopy;
    let confirmed: ListingSnapshot;
    if (task.variationKey && "specifics" in target) {
      updateHandoffRun(run.id, { status: "publishing" });
      await actions.publishVariation(listing.itemId, target, 1, copy.targetPrice);
      confirmed = await actions.readListing(listing.itemId);
      const actual = selectedTarget(current, confirmed);
      if (!actual || actual.quantityAvailable !== 1 || actual.quantitySold !== run.triggerQuantitySold || !priceMatches(actual.price, copy.targetPrice)) throw new Error("eBay did not confirm the published variation");
    } else {
      updateHandoffRun(run.id, { status: "uploading" });
      const pictureUrls: string[] = content?.reusesListingPhotos ? [...content.listingPictureUrls] : [];
      for (const photo of copy.photos) {
        renewTaskLease(taskId, owner);
        if (photo.ebayImageUrl && photo.ebayImageId && photo.ebayImageExpiresAt && Date.parse(photo.ebayImageExpiresAt) > Date.now() + 300_000) {
          pictureUrls.push(photo.ebayImageUrl);
        } else {
          const record = photoStorageRecord(photo.id);
          if (!record) throw new Error(`Local photo ${photo.id} is missing`);
          const upload = await actions.uploadImage({ buffer: actions.readImage(record.storageKey), filename: photo.originalName.replace(/\.[^.]+$/, "") + ".jpg", mimeType: record.mimeType });
          recordPhotoEbayUpload(photo.id, upload.imageId, upload.imageUrl, upload.expirationDate);
          pictureUrls.push(upload.imageUrl);
        }
      }
      updateHandoffRun(run.id, { status: "revising", ebayPictureUrls: pictureUrls, conditionDescription: content!.conditionDescription });
      renewTaskLease(taskId, owner);
      confirmed = await stageAndPublishCopy({ itemId: listing.itemId, conditionId: copy.conditionId, conditionDescription: content!.conditionDescription, pictureUrls, targetPrice: copy.targetPrice, currency: listing.currency, expectedQuantitySold: run.triggerQuantitySold }, {
        reviseListing: actions.reviseListing, readListing: actions.readListing, publishQuantity: actions.publishQuantity,
        onStaged: () => { renewTaskLease(taskId, owner); updateHandoffRun(run!.id, { status: "publishing" }); },
      });
    }
    renewTaskLease(taskId, owner);
    completeHandoff({ taskId, copyId: copy.id, runId: run.id, snapshot: confirmed });
    return { taskId, action: "restocked", message: "Queued copy confirmed live on eBay", listing: confirmed, plan, remainingQueuedCopies: getTask(taskId)!.queuedCopies.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Restock failed";
    const uncertain = publicationUncertain(getHandoffRun(run.id).status);
    updateHandoffRun(run.id, { status: uncertain ? "reconciling" : "failed", error: message });
    setTaskStatus(taskId, uncertain ? "reconciling" : "error", message);
    appendActivity({ taskId, type: "restock_failed", level: "error", message, details: { runId: run.id }, dedupeKey: `failed:${run.id}:${message}` });
    return { taskId, action: "failed", message: uncertain ? "Publication unconfirmed; automatic retries are blocked until reconciliation" : message, listing, plan };
  }
}

export async function resolveHandoff(taskId: string, runId: string, action: "sold" | "retry", reviewed: boolean, reviewedCopyId?: string, readListing: typeof fetchListing = fetchListing): Promise<RestockTask> {
  if (!reviewed) throw new Error("Review the physical copy and eBay before resolving publication");
  const owner = randomUUID();
  if (!acquireTaskLease(taskId, owner)) throw new Error("Wait for the current restock check to finish");
  try {
    const task = getTask(taskId);
    let run = pendingHandoffRun(taskId);
    if (!task || task.status === "paused" || !run || run.id !== runId || run.status !== "reconciling") throw new Error("No matching reconciliation; resume paused tasks before review");
    if (!run.copyId && reviewedCopyId) run = bindReviewedLegacyHandoff(runId, reviewedCopyId);
    if (!run.copyId) throw new Error("Review and identify the physical copy before resolving this legacy handoff");
    const listing = await readListing(task.itemId);
    const target = selectedTarget(task, listing);
    if (!target || target.quantityAvailable !== 0) throw new Error("Recheck eBay: the target must be at zero");
    renewTaskLease(taskId, owner);
    if (action === "sold") {
      if (!copyMatches(task, listing, run, 0) || target.quantitySold <= run.triggerQuantitySold) throw new Error("The sold copy does not match this handoff");
      completeHandoff({ taskId, copyId: run.copyId, runId, snapshot: listing, consumed: true });
    } else {
      if (target.quantitySold !== run.triggerQuantitySold || !listing.supported) throw new Error("The sale baseline changed; do not retry this copy");
      if (!scheduleHandoffRun(runId, new Date(Date.now() + restockDelaySeconds(task.queuedCopy?.releaseDelaySeconds ?? task.restockDelaySeconds) * 1000).toISOString(), true)) throw new Error("Handoff state changed");
      setTaskStatus(taskId, "scheduled");
    }
    appendActivity({ taskId, type: "handoff_reviewed", level: "warning", message: action === "sold" ? "Seller confirmed the copy sold" : "Seller confirmed the copy was not published; retry scheduled", details: { runId, copyId: run.copyId } });
    return getTask(taskId)!;
  } finally { releaseTaskLease(taskId, owner); }
}

export async function processAllTasks(shouldStop = () => false): Promise<WorkerResult[]> {
  const results: WorkerResult[] = [];
  for (const taskId of activeTaskIds()) {
    if (shouldStop()) break;
    try { results.push(await processTask(taskId)); }
    catch (error) {
      const task = getTask(taskId);
      if (!task) continue;
      const message = error instanceof Error ? error.message : "Worker failed";
      const uncertain = publicationUncertain(pendingHandoffRun(taskId)?.status ?? "");
      setTaskStatus(taskId, uncertain ? "reconciling" : "error", message);
      appendActivity({ taskId, type: "worker_error", level: "error", message });
      const result: WorkerResult = { taskId, action: "failed", message, listing: task.listing };
      results.push(result);
      try { await defaultActions.notify(result); } catch { /* Optional alerts cannot interrupt the next task. */ }
    }
  }
  try { await flushDiscordNotifications(); } catch { /* Retry independently on the next tick, including when there are no tasks. */ }
  return results;
}
