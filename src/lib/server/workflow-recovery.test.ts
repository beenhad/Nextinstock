import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, test } from "node:test";
import type { ListingSnapshot, SystemStatus } from "../types";
import { addQueuedCopies, approveHandoffRun, replayCopyRequest, reorderQueuedCopies, setQueuedCopyPrices, updateTask, updateTaskSettings, updateQueuedCopyDetails, addQueuedCopy, claimDiscordNotifications, completeHandoff, createTask, getHandoffRun, getOrCreateHandoffRun, getTask, moveQueuedCopy, pendingHandoffRun, queueDiscordNotification, recordDiscordDelivery, scheduleHandoffRun, setTaskPaused, updateQueuedCopyPrice } from "./database";
import { processTask, resolveHandoff } from "./restock-worker";

const directory = mkdtempSync(path.join(os.tmpdir(), "nextinstock-recovery-"));
process.env.NEXTINSTOCK_DATA_DIR = directory;
process.env.SELLERMAID_ENV_FILE = "";
after(() => rmSync(directory, { recursive: true, force: true }));
let nextId = 123456789;

function fixture(variation: boolean, outcome: "confirmed" | "timeout" | "sold" | "upload-failed", scheduled = true) {
  const itemId = String(nextId++);
  const taskId = `task-${itemId}`;
  let listing: ListingSnapshot = {
    itemId, sku: null, title: "Fixture", listingUrl: "https://example.invalid", listingType: "FixedPriceItem", listingStatus: "Active", listingDuration: "GTC",
    conditionId: "3000", conditionName: "Used", conditionDescription: "Old copy", price: 20, currency: "USD",
    quantityTotal: 10, quantitySold: 10, quantityAvailable: 0, imageUrls: ["https://example.invalid/old.jpg"],
    variationCount: variation ? 1 : 0, variations: variation ? [{ key: "black", sku: null, specifics: [{ name: "Color", value: "Black" }], label: "Black", price: 20, currency: "USD", quantityTotal: 10, quantitySold: 10, quantityAvailable: 0, imageUrls: [], hasSpecificPhotos: false }] : [],
    variationPictureAxis: null, outOfStockControl: true, supported: true, unsupportedReasons: [], fetchedAt: new Date().toISOString(),
  };
  const images = variation ? [] : [{ storageKey: `${taskId}/photo.jpg`, originalName: "photo.jpg", mimeType: "image/jpeg" as const, byteSize: 10, width: 500, height: 500, sha256: "fixture" }];
  const task = createTask({ taskId, copyId: `copy-${itemId}`, snapshot: listing, variationKey: variation ? "black" : null, internalReference: "COPY", conditionDescription: "Next copy", images });
  const run = getOrCreateHandoffRun(taskId, 10);
  if (scheduled) scheduleHandoffRun(run.id, "2000-01-01T00:00:00.000Z");
  let writes = 0;
  let failRead = false;
  let reads = 0;
  const publish = async () => {
    writes++;
    const target = variation ? listing.variations[0] : listing;
    target.quantityAvailable = outcome === "sold" ? 0 : 1;
    if (outcome === "sold") { target.quantitySold++; target.quantityTotal++; }
    failRead = outcome === "timeout";
  };
  const actions: NonNullable<Parameters<typeof processTask>[1]> = {
    readListing: async () => { reads++; if (failRead) { failRead = false; throw new Error("Confirmation timeout"); } return structuredClone(listing); },
    reviseListing: async (input) => { listing = { ...listing, conditionId: input.conditionId, conditionDescription: input.conditionDescription, imageUrls: input.pictureUrls, quantityAvailable: 0 }; },
    publishQuantity: publish, publishVariation: publish,
    uploadImage: async () => { if (outcome === "upload-failed") throw new Error("Upload failed"); return { imageId: "eps", imageUrl: "https://example.invalid/next.jpg", expirationDate: "2099-01-01T00:00:00.000Z" }; },
    readImage: () => Buffer.from("fixture"), status: () => ({ liveWritesAuthorized: true } as SystemStatus), notify: async () => {},
  };
  return { task, taskId, run, actions, listing, images, writes: () => writes, reads: () => reads };
}

for (const variation of [false, true]) {
  test(`${variation ? "variation" : "single"}: accepted write and failed readback reconcile once`, async () => {
    const f = fixture(variation, "timeout");
    assert.equal((await processTask(f.taskId, f.actions)).action, "failed");
    assert.equal(getTask(f.taskId)!.status, "reconciling");
    assert.equal(getTask(f.taskId)!.queuedCopy!.status, "failed");
    assert.equal((await processTask(f.taskId, f.actions)).action, "restocked");
    assert.equal(f.writes(), 1);
    assert.equal(getHandoffRun(f.run.id).status, "completed");
    assert.equal(getTask(f.taskId)!.queuedCopies.length, 0);
  });

  test(`${variation ? "variation" : "single"}: sale before confirmation never republishes the copy`, async () => {
    const f = fixture(variation, "sold");
    assert.equal((await processTask(f.taskId, f.actions)).action, "failed");
    for (let pass = 0; pass < 3; pass++) assert.equal((await processTask(f.taskId, f.actions)).action, "skipped");
    assert.equal(f.writes(), 1);
    assert.equal(getOrCreateHandoffRun(f.taskId, 11).id, f.run.id);
    assert.equal(getTask(f.taskId)!.queuedCopy!.id, f.task.queuedCopy!.id);
    assert.throws(() => updateQueuedCopyPrice(f.taskId, f.task.queuedCopy!.id, 30), /locked/);
    assert.throws(() => moveQueuedCopy(f.taskId, f.task.queuedCopy!.id, "down"), /locked/);
  });
}

test("direct checks respect pause and refilling an empty paused queue does not resume it", async () => {
  const f = fixture(true, "confirmed");
  assert.equal((await processTask(f.taskId, f.actions)).action, "restocked");
  setTaskPaused(f.taskId, true);
  addQueuedCopy({ taskId: f.taskId, copyId: "refill", snapshot: f.listing, internalReference: "REFILL", conditionDescription: "", images: [] });
  const before = f.reads();
  assert.equal((await processTask(f.taskId, f.actions)).action, "skipped");
  assert.equal(f.reads(), before);
  assert.equal(getTask(f.taskId)!.status, "paused");
});

test("safe pre-publication failure schedules a fresh hold and retains copy identity", async () => {
  const f = fixture(false, "upload-failed");
  assert.equal((await processTask(f.taskId, f.actions)).action, "failed");
  assert.equal(f.writes(), 0);
  assert.equal((await processTask(f.taskId, f.actions)).action, "restock_scheduled");
  assert.equal(pendingHandoffRun(f.taskId)!.copyId, f.task.queuedCopy!.id);
  assert.equal((await processTask(f.taskId, f.actions)).action, "waiting_for_restock");
});

test("legacy uncertain runs without copy identity hold instead of acquiring today's head", async () => {
  const f = fixture(true, "confirmed");
  const db = new DatabaseSync(path.join(directory, "nextinstock.sqlite"));
  db.prepare("UPDATE handoff_runs SET status = 'reconciling', copy_id = NULL WHERE id = ?").run(f.run.id);
  db.close();
  assert.equal((await processTask(f.taskId, f.actions)).action, "skipped");
  assert.equal(f.writes(), 0);
  assert.equal(pendingHandoffRun(f.taskId)!.copyId, null);
});

test("notification claims exclude concurrent senders and failed rows back off without blocking later rows", () => {
  queueDiscordNotification("a", { content: "first" }, "channel");
  assert.deepEqual(claimDiscordNotifications("owner-a", "channel").map((row) => row.eventKey), ["a"]);
  assert.deepEqual(claimDiscordNotifications("owner-b", "channel"), []);
  recordDiscordDelivery("a", "Temporary failure", "owner-a");
  queueDiscordNotification("b", { content: "second" }, "channel");
  queueDiscordNotification("c", { content: "different destination" }, "other-channel");
  assert.deepEqual(claimDiscordNotifications("owner-b", "channel").map((row) => row.eventKey), ["b"]);
});


test("reviewing an already sold publication advances once and arms the next physical copy", async () => {
  const f = fixture(false, "sold");
  addQueuedCopy({ taskId: f.taskId, copyId: "next-after-sold", snapshot: f.listing, internalReference: "NEXT", conditionDescription: "Next copy", images: f.images.map((image) => ({ ...image, storageKey: image.storageKey + "-next" })) });
  await processTask(f.taskId, f.actions);
  await assert.rejects(() => resolveHandoff(f.taskId, f.run.id, "sold", false, f.task.queuedCopy!.id, f.actions.readListing), /Review/);
  await resolveHandoff(f.taskId, f.run.id, "sold", true, f.task.queuedCopy!.id, f.actions.readListing);
  assert.equal(getTask(f.taskId)!.queuedCopy!.id, "next-after-sold");
  assert.equal(getTask(f.taskId)!.armedQuantitySold, 11);
  const snapshot = await f.actions.readListing!(f.task.itemId);
  completeHandoff({ taskId: f.taskId, runId: f.run.id, copyId: f.task.queuedCopy!.id, snapshot, consumed: true });
  assert.equal(getTask(f.taskId)!.queuedCopy!.id, "next-after-sold");
  assert.equal((await processTask(f.taskId, f.actions)).action, "restock_scheduled");
  assert.equal(pendingHandoffRun(f.taskId)!.copyId, "next-after-sold");
  assert.equal(f.writes(), 1);
});

test("an uncertain publication retries only after review and a new persisted hold", async () => {
  const f = fixture(false, "confirmed");
  f.actions.publishQuantity = async () => { throw new Error("Request failed with unknown acceptance"); };
  await processTask(f.taskId, f.actions);
  assert.equal((await processTask(f.taskId, f.actions)).action, "skipped");
  await resolveHandoff(f.taskId, f.run.id, "retry", true, f.task.queuedCopy!.id, f.actions.readListing);
  assert.equal((await processTask(f.taskId, f.actions)).action, "waiting_for_restock");
  assert.equal(getHandoffRun(f.run.id).copyId, f.task.queuedCopy!.id);
});


for (const fresh of [true, false]) test(`pre-publication retry ${fresh ? "reuses a fresh" : "replaces an expired"} EPS receipt`, async () => {
  const f = fixture(false, "confirmed");
  let uploads = 0;
  f.actions.uploadImage = async () => { uploads++; return { imageId: "eps", imageUrl: "https://example.invalid/next.jpg", expirationDate: fresh ? "2099-01-01T00:00:00.000Z" : "2000-01-01T00:00:00.000Z" }; };
  const revise = f.actions.reviseListing!;
  let interrupted = false;
  f.actions.reviseListing = async (input) => { if (!interrupted) { interrupted = true; throw new Error("Staging failed"); } await revise(input); };
  assert.equal((await processTask(f.taskId, f.actions)).action, "failed");
  assert.equal((await processTask(f.taskId, f.actions)).action, "restock_scheduled");
  const db = new DatabaseSync(path.join(directory, "nextinstock.sqlite"));
  db.prepare("UPDATE handoff_runs SET execute_after = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(f.run.id);
  db.close();
  assert.equal((await processTask(f.taskId, f.actions)).action, "restocked");
  assert.equal(uploads, fresh ? 1 : 2);
});

for (const variation of [false, true]) {
  test(`${variation ? "variation" : "single"}: approval reserves the physical copy across pause and scheduling`, async () => {
    const f = fixture(variation, "confirmed", false);
    const copyId = f.task.queuedCopy!.id;
    updateQueuedCopyDetails(f.taskId, copyId, { needsApproval: true, releaseDelaySeconds: 3600 });
    assert.equal((await processTask(f.taskId, f.actions)).action, "awaiting_approval");
    assert.equal((await processTask(f.taskId, f.actions)).action, "awaiting_approval");
    assert.equal(pendingHandoffRun(f.taskId)!.copyId, copyId);
    for (const edit of [
      () => updateQueuedCopyDetails(f.taskId, copyId, { needsApproval: false }),
      () => reorderQueuedCopies(f.taskId, [copyId]),
      () => setQueuedCopyPrices(f.taskId, [{ copyId, targetPrice: 35 }]),
      () => updateTaskSettings(f.taskId, { restockDelaySeconds: 15 }),
    ]) assert.throws(edit, /locked/);
    setTaskPaused(f.taskId, true);
    assert.equal(approveHandoffRun(f.taskId), false);
    assert.equal((await processTask(f.taskId, f.actions)).action, "skipped");
    setTaskPaused(f.taskId, false);
    assert.equal(getTask(f.taskId)!.status, "awaiting_approval");
    assert.equal(approveHandoffRun(f.taskId), true);
    assert.equal(approveHandoffRun(f.taskId), false);
    assert.throws(() => updateQueuedCopyDetails(f.taskId, copyId, { internalReference: "CHANGED" }), /locked/);
    assert.equal((await processTask(f.taskId, f.actions)).action, "restock_scheduled");
    const remaining = Date.parse(pendingHandoffRun(f.taskId)!.executeAfter!) - Date.now();
    assert.ok(remaining > 13_000 && remaining <= 15_000);
    assert.equal(f.writes(), 0);
    const db = new DatabaseSync(path.join(directory, "nextinstock.sqlite"));
    db.prepare("UPDATE handoff_runs SET execute_after = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(f.run.id);
    db.close();
    assert.equal((await processTask(f.taskId, f.actions)).action, "restocked");
    assert.equal(f.writes(), 1);
  });
}

test("a copy's saved wait overrides the task wait without publishing early", async () => {
  const f = fixture(true, "confirmed", false);
  updateTaskSettings(f.taskId, { restockDelaySeconds: 7200 });
  updateQueuedCopyDetails(f.taskId, f.task.queuedCopy!.id, { releaseDelaySeconds: 3600 });
  assert.equal((await processTask(f.taskId, f.actions)).action, "restock_scheduled");
  const remaining = Date.parse(pendingHandoffRun(f.taskId)!.executeAfter!) - Date.now();
  assert.ok(remaining > 3_598_000 && remaining <= 3_600_000);
  assert.equal((await processTask(f.taskId, f.actions)).action, "waiting_for_restock");
  assert.equal(f.writes(), 0);
});

test("an identical copy publishes using the saved live photos and condition note", async () => {
  const f = fixture(false, "confirmed");
  const db = new DatabaseSync(path.join(directory, "nextinstock.sqlite"));
  db.prepare("DELETE FROM photos WHERE copy_id = ?").run(f.task.queuedCopy!.id);
  db.prepare("UPDATE copies SET condition_description = '' WHERE id = ?").run(f.task.queuedCopy!.id);
  db.close();
  f.actions.uploadImage = async () => { throw new Error("Identical stock must not upload photos"); };
  assert.equal((await processTask(f.taskId, f.actions)).action, "restocked");
  assert.equal(f.writes(), 1);
  assert.deepEqual(getTask(f.taskId)!.listing.imageUrls, ["https://example.invalid/old.jpg"]);
  assert.equal(getTask(f.taskId)!.listing.conditionDescription, "Old copy");
});

test("bulk copy insertion rolls back failures and inserts atomically after its anchor", () => {
  const f = fixture(true, "confirmed", false);
  const input = (copyId: string, afterCopyId?: string) => ({ taskId: f.taskId, copyId, afterCopyId, snapshot: f.listing, internalReference: copyId, conditionDescription: "", images: [] });
  const receipt = { id: "bulk-receipt", fingerprint: "bulk-content" };
  assert.throws(() => addQueuedCopies([input("duplicate"), input("duplicate")], receipt), /UNIQUE/);
  assert.equal(getTask(f.taskId)!.queuedCopies.length, 1);
  assert.equal(replayCopyRequest(receipt.id, receipt.fingerprint), null);
  addQueuedCopy(input("tail"));
  addQueuedCopies([input("insert-one", f.task.queuedCopy!.id), input("insert-two", "insert-one")], receipt);
  assert.deepEqual(getTask(f.taskId)!.queuedCopies.map((copy) => copy.id), [f.task.queuedCopy!.id, "insert-one", "insert-two", "tail"]);
  assert.equal(replayCopyRequest(receipt.id, receipt.fingerprint)!.queuedCopies.length, 4);
  assert.throws(() => replayCopyRequest(receipt.id, "changed"), /already saved/);
});

test("a combined task edit rolls back its settings and order if any price fails", () => {
  const f = fixture(true, "confirmed", false);
  addQueuedCopy({ taskId: f.taskId, copyId: "edit-tail", snapshot: f.listing, internalReference: "TAIL", conditionDescription: "", images: [] });
  const before = getTask(f.taskId)!;
  assert.throws(() => updateTask(f.taskId, {
    restockDelaySeconds: 3600, priceRule: { mode: "amount", step: 2, cap: null },
    order: ["edit-tail", f.task.queuedCopy!.id],
    prices: [{ copyId: "edit-tail", targetPrice: 25 }, { copyId: "missing", targetPrice: 30 }],
  }), /not found/);
  const after = getTask(f.taskId)!;
  assert.equal(after.restockDelaySeconds, before.restockDelaySeconds);
  assert.equal(after.priceRule, before.priceRule);
  assert.deepEqual(after.queuedCopies, before.queuedCopies);
});
