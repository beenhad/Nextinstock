import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import type { ListingSnapshot } from "@/lib/types";

test("only one worker owns a task, and an expired lease can be recovered", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "nextinstock-lease-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  process.env.NEXTINSTOCK_DATA_DIR = directory;
  const legacy = new DatabaseSync(path.join(directory, "nextinstock.sqlite"));
  legacy.exec(`CREATE TABLE restock_tasks (
    id TEXT PRIMARY KEY, item_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL,
    armed_quantity_sold INTEGER NOT NULL, last_seen_quantity_sold INTEGER NOT NULL,
    last_seen_quantity_available INTEGER NOT NULL, last_checked_at TEXT,
    last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  legacy.exec(`CREATE TABLE copies (
    id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES restock_tasks(id),
    internal_reference TEXT NOT NULL, condition_id TEXT, condition_name TEXT,
    condition_description TEXT NOT NULL, status TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  legacy.prepare("INSERT INTO restock_tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run("legacy-task", "legacy-item", "active", 1, 0, 1, null, null, "2025-01-01", "2025-01-01");
  legacy.prepare("INSERT INTO copies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run("legacy-copy", "legacy-task", "LEGACY", null, null, "Saved note", "queued", "2025-01-01", "2025-01-01");
  legacy.close();
  const { acquireTaskLease, addQueuedCopy, approveHandoffRun, updateHandoffRun, completeHandoff, createTask, getOrCreateHandoffRun, getTask, moveQueuedCopy, pendingDiscordNotifications, queueDiscordNotification, recordDiscordDelivery, releaseTaskLease, removeQueuedCopy, renewTaskLease, reorderQueuedCopies, scheduleHandoffRun, setQueuedCopyPrices, updateQueuedCopyDetails, updateTaskSettings, updateQueuedCopyPrice, upsertListing } = await import("./database");
  const snapshot: ListingSnapshot = {
    itemId: "123456789",
    sku: null,
    title: "Lease test item",
    listingUrl: "https://www.ebay.com/itm/123456789",
    listingType: "FixedPriceItem",
    listingStatus: "Active",
    listingDuration: "GTC",
    conditionId: "3000",
    conditionName: "Used",
    conditionDescription: "Test condition",
    price: 1,
    currency: "USD",
    quantityTotal: 1,
    quantitySold: 0,
    quantityAvailable: 1,
    imageUrls: ["https://i.ebayimg.com/test.jpg"],
    variationCount: 0,
    variations: [],
    variationPictureAxis: null,
    outOfStockControl: true,
    supported: true,
    unsupportedReasons: [],
    fetchedAt: new Date().toISOString(),
  };
  upsertListing({ ...snapshot, itemId: "legacy-item" });
  const migrated = new DatabaseSync(path.join(directory, "nextinstock.sqlite"));
  assert.equal((migrated.prepare("SELECT variation_key FROM restock_tasks WHERE id = 'legacy-task'").get() as { variation_key: string }).variation_key, "");
  assert.equal((migrated.prepare("SELECT task_id FROM copies WHERE id = 'legacy-copy'").get() as { task_id: string }).task_id, "legacy-task");
  assert.equal((migrated.prepare("SELECT target_price FROM copies WHERE id = 'legacy-copy'").get() as { target_price: number | null }).target_price, null);
  assert.deepEqual(migrated.prepare("PRAGMA foreign_key_check").all(), []);
  migrated.close();
  const task = createTask({
    taskId: "task-one",
    copyId: "copy-one",
    snapshot,
    internalReference: "COPY-1",
    conditionDescription: "Test condition",
    images: [],
  });
  const run = getOrCreateHandoffRun(task.id, 1);
  assert.equal(scheduleHandoffRun(run.id, "2026-10-02T19:31:00.000Z"), true);
  assert.equal(scheduleHandoffRun(run.id, "2026-10-02T19:32:00.000Z"), false);
  assert.equal(getOrCreateHandoffRun(task.id, 1).executeAfter, "2026-10-02T19:31:00.000Z");

  assert.equal(acquireTaskLease(task.id, "worker-a"), true);
  assert.equal(acquireTaskLease(task.id, "worker-b"), false);
  renewTaskLease(task.id, "worker-a");
  releaseTaskLease(task.id, "worker-b");
  assert.equal(acquireTaskLease(task.id, "worker-b"), false);

  const secondConnection = new DatabaseSync(path.join(directory, "nextinstock.sqlite"));
  secondConnection.prepare("UPDATE restock_tasks SET lease_expires_at = ? WHERE id = ?")
    .run("2000-01-01T00:00:00.000Z", task.id);
  secondConnection.close();
  assert.equal(acquireTaskLease(task.id, "worker-b"), true);
  releaseTaskLease(task.id, "worker-a");
  assert.equal(acquireTaskLease(task.id, "worker-c"), false);
  releaseTaskLease(task.id, "worker-b");
  assert.equal(acquireTaskLease(task.id, "worker-c"), true);
  releaseTaskLease(task.id, "worker-c");

  addQueuedCopy({ taskId: task.id, copyId: "copy-two", snapshot, internalReference: "COPY-2", conditionDescription: "Second copy", targetPrice: 34.99, images: [] });
  addQueuedCopy({ taskId: task.id, copyId: "copy-three", snapshot, internalReference: "COPY-3", conditionDescription: "Third copy", targetPrice: 39.99, images: [] });
  assert.deepEqual(getTask(task.id)?.queuedCopies.map((copy) => copy.internalReference), ["COPY-1", "COPY-2", "COPY-3"]);
  updateQueuedCopyPrice(task.id, "copy-three", 44.99);
  moveQueuedCopy(task.id, "copy-three", "up");
  assert.deepEqual(getTask(task.id)?.queuedCopies.map((copy) => [copy.internalReference, copy.targetPrice]), [["COPY-1", null], ["COPY-3", 44.99], ["COPY-2", 34.99]]);
  updateQueuedCopyDetails(task.id, "copy-two", { internalReference: " COPY-2B ", conditionDescription: "Second copy, case cracked" });
  assert.equal(getTask(task.id)?.queuedCopies[2].internalReference, "COPY-2B");
  assert.equal(getTask(task.id)?.queuedCopies[2].conditionDescription, "Second copy, case cracked");
  // copy-two has no photos, so it is an identical copy: a blank note means "keep the listing's note".
  assert.equal(updateQueuedCopyDetails(task.id, "copy-two", { conditionDescription: "  " }).queuedCopies[2].conditionDescription, "");
  updateQueuedCopyDetails(task.id, "copy-two", { conditionDescription: "Second copy, case cracked" });
  addQueuedCopy({ taskId: task.id, copyId: "copy-four", snapshot, internalReference: "COPY-4", conditionDescription: "Fourth copy", targetPrice: null, images: [] });
  removeQueuedCopy(task.id, "copy-four");
  assert.deepEqual(getTask(task.id)?.queuedCopies.map((copy) => copy.internalReference), ["COPY-1", "COPY-3", "COPY-2B"]);
  assert.throws(() => removeQueuedCopy(task.id, "copy-four"), /not found/);
  addQueuedCopy({ taskId: task.id, copyId: "copy-same", snapshot, internalReference: "SAME", conditionDescription: "", targetPrice: null, images: [] });
  updateQueuedCopyDetails(task.id, "copy-same", { internalReference: "SAME-A" });
  const reordered = reorderQueuedCopies(task.id, ["copy-same", "copy-one", "copy-two", "copy-three"].filter((id) => getTask(task.id)?.queuedCopies.some((copy) => copy.id === id)));
  assert.equal(reordered.queuedCopies[0].internalReference, "SAME-A");
  assert.throws(() => reorderQueuedCopies(task.id, ["copy-same"]), /queue changed/);
  const repriced = setQueuedCopyPrices(task.id, reordered.queuedCopies.map((copy, index) => ({ copyId: copy.id, targetPrice: 30 + index })));
  assert.deepEqual(repriced.queuedCopies.map((copy) => copy.targetPrice), reordered.queuedCopies.map((_, index) => 30 + index));
  const configured = updateTaskSettings(task.id, { restockDelaySeconds: 5, priceRule: { mode: "amount", step: 2, cap: 60 } });
  assert.equal(configured.restockDelaySeconds, 15);
  assert.deepEqual(configured.priceRule, { mode: "amount", step: 2, cap: 60 });
  assert.equal(updateTaskSettings(task.id, { priceRule: null, restockDelaySeconds: null }).priceRule, null);
  assert.throws(() => updateTaskSettings(task.id, { priceRule: { mode: "percent", step: 500, cap: null } }), /out of range/);
  for (const copy of getTask(task.id)!.queuedCopies.filter((candidate) => candidate.id !== "copy-one" && candidate.id !== "copy-three" && candidate.id !== "copy-two")) removeQueuedCopy(task.id, copy.id);
  reorderQueuedCopies(task.id, ["copy-one", "copy-three", "copy-two"].filter((id) => getTask(task.id)?.queuedCopies.some((copy) => copy.id === id)));
  completeHandoff({ taskId: task.id, copyId: "copy-one", runId: run.id, snapshot: { ...snapshot, quantitySold: 1, quantityAvailable: 1 } });
  assert.equal(getTask(task.id)?.queuedCopy?.internalReference, "COPY-3");
  assert.equal(getTask(task.id)?.status, "active");

  const variationSnapshot: ListingSnapshot = {
    ...snapshot,
    variations: [
      { key: "indigo", sku: null, specifics: [{ name: "Colors", value: "Indigo" }], label: "Colors: Indigo", price: 20, currency: "USD", quantityTotal: 2, quantitySold: 0, quantityAvailable: 2, imageUrls: snapshot.imageUrls, hasSpecificPhotos: true },
      { key: "black", sku: null, specifics: [{ name: "Colors", value: "Black" }], label: "Colors: Black", price: 20, currency: "USD", quantityTotal: 0, quantitySold: 0, quantityAvailable: 0, imageUrls: snapshot.imageUrls, hasSpecificPhotos: true },
    ],
    variationCount: 2,
  };
  const indigo = createTask({ taskId: "indigo-task", copyId: "indigo-copy", snapshot: variationSnapshot, variationKey: "indigo", internalReference: "INDIGO", conditionDescription: "Internal copy note", images: [] });
  const black = createTask({ taskId: "black-task", copyId: "black-copy", snapshot: variationSnapshot, variationKey: "black", internalReference: "BLACK", conditionDescription: "Internal copy note", images: [] });
  assert.equal(indigo.armedQuantitySold, 2);
  assert.equal(black.armedQuantitySold, 0);
  assert.equal(acquireTaskLease(indigo.id, "worker-indigo"), true);
  assert.equal(acquireTaskLease(black.id, "worker-black"), false);
  releaseTaskLease(indigo.id, "worker-indigo");
  assert.equal(acquireTaskLease(black.id, "worker-black"), true);
  releaseTaskLease(black.id, "worker-black");
  queueDiscordNotification("sale:8", { content: "sale" });
  queueDiscordNotification("sale:8", { content: "duplicate" });
  assert.deepEqual(pendingDiscordNotifications(), [{ eventKey: "sale:8", payload: { content: "sale" } }]);
  recordDiscordDelivery("sale:8", "Temporary failure");
  assert.equal(pendingDiscordNotifications().length, 1);
  recordDiscordDelivery("sale:8", null);
  assert.equal(pendingDiscordNotifications().length, 0);
  // A listing can start with an empty line, then copies carry their own timing.
  const blank = createTask({ taskId: "blank-task", copyId: null, snapshot: { ...snapshot, itemId: "555000111" }, internalReference: "", conditionDescription: "", images: [] });
  assert.equal(blank.queuedCopies.length, 0);
  addQueuedCopy({ taskId: "blank-task", copyId: "blank-1", snapshot: { ...snapshot, itemId: "555000111" }, internalReference: "B-1", conditionDescription: "", targetPrice: 20, releaseDelaySeconds: 3600, needsApproval: true, images: [] });
  const timed = getTask("blank-task")!.queuedCopies[0];
  assert.equal(timed.releaseDelaySeconds, 3600);
  assert.equal(timed.needsApproval, true);
  const retimed = updateQueuedCopyDetails("blank-task", "blank-1", { releaseDelaySeconds: null, needsApproval: false }).queuedCopies[0];
  assert.equal(retimed.releaseDelaySeconds, null);
  assert.equal(retimed.needsApproval, false);
  assert.equal(updateQueuedCopyDetails("blank-task", "blank-1", { grade: "great" }).queuedCopies[0].grade, "great");
  assert.throws(() => updateQueuedCopyDetails("blank-task", "blank-1", { grade: "mint" }), /condition/);
  // Approval releases only a run that is actually waiting.
  const waitingRun = getOrCreateHandoffRun("blank-task", 9);
  assert.equal(approveHandoffRun("blank-task"), false);
  updateHandoffRun(waitingRun.id, { status: "awaiting_approval" });
  assert.equal(approveHandoffRun("blank-task"), true);
  const approved = getOrCreateHandoffRun("blank-task", 9);
  assert.ok(approved.approvedAt);
  assert.equal(approved.status, "created");
  assert.equal(approveHandoffRun("blank-task"), false);

});
