import { randomUUID } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ActivityEvent,
  ListingSnapshot,
  QueuedCopy,
  RestockTask,
  TaskPhoto,
  TaskStatus,
} from "@/lib/types";
import { dataDirectory } from "./config";
import type { StoredImage } from "./storage";

let instance: DatabaseSync | null = null;

function database(): DatabaseSync {
  if (instance) return instance;
  const db = new DatabaseSync(path.join(dataDirectory(), "nextinstock.sqlite"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      item_id TEXT PRIMARY KEY,
      sku TEXT,
      title TEXT NOT NULL,
      listing_url TEXT NOT NULL,
      listing_type TEXT NOT NULL,
      listing_status TEXT NOT NULL,
      listing_duration TEXT,
      condition_id TEXT,
      condition_name TEXT,
      condition_description TEXT,
      price REAL,
      currency TEXT NOT NULL,
      quantity_total INTEGER NOT NULL,
      quantity_sold INTEGER NOT NULL,
      quantity_available INTEGER NOT NULL,
      image_urls_json TEXT NOT NULL,
      variation_count INTEGER NOT NULL,
      out_of_stock_control INTEGER,
      supported INTEGER NOT NULL,
      unsupported_reasons_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS restock_tasks (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL UNIQUE REFERENCES listings(item_id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      armed_quantity_sold INTEGER NOT NULL,
      last_seen_quantity_sold INTEGER NOT NULL,
      last_seen_quantity_available INTEGER NOT NULL,
      last_checked_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS copies (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES restock_tasks(id) ON DELETE CASCADE,
      internal_reference TEXT NOT NULL,
      condition_id TEXT,
      condition_name TEXT,
      condition_description TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS copies_task_status_idx ON copies(task_id, status, created_at);

    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      copy_id TEXT NOT NULL REFERENCES copies(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      ebay_image_id TEXT,
      ebay_image_url TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS handoff_runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES restock_tasks(id) ON DELETE CASCADE,
      trigger_quantity_sold INTEGER NOT NULL,
      status TEXT NOT NULL,
      ebay_picture_urls_json TEXT NOT NULL DEFAULT '[]',
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(task_id, trigger_quantity_sold)
    );

    CREATE TABLE IF NOT EXISTS activity_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT REFERENCES restock_tasks(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      details_json TEXT NOT NULL,
      dedupe_key TEXT UNIQUE,
      created_at TEXT NOT NULL
    );
  `);
  const listingColumns = db.prepare("PRAGMA table_info(listings)").all() as Array<{
    name?: string;
  }>;
  if (!listingColumns.some((column) => column.name === "out_of_stock_control")) {
    db.exec("ALTER TABLE listings ADD COLUMN out_of_stock_control INTEGER");
  }
  instance = db;
  return db;
}

function now(): string {
  return new Date().toISOString();
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

function parseJson<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(asString(value)) as T;
  } catch {
    return fallback;
  }
}

export function upsertListing(snapshot: ListingSnapshot) {
  database().prepare(`
    INSERT INTO listings (
      item_id, sku, title, listing_url, listing_type, listing_status,
      listing_duration, condition_id, condition_name, condition_description,
      price, currency, quantity_total, quantity_sold, quantity_available,
      image_urls_json, variation_count, out_of_stock_control, supported,
      unsupported_reasons_json, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      sku = excluded.sku,
      title = excluded.title,
      listing_url = excluded.listing_url,
      listing_type = excluded.listing_type,
      listing_status = excluded.listing_status,
      listing_duration = excluded.listing_duration,
      condition_id = excluded.condition_id,
      condition_name = excluded.condition_name,
      condition_description = excluded.condition_description,
      price = excluded.price,
      currency = excluded.currency,
      quantity_total = excluded.quantity_total,
      quantity_sold = excluded.quantity_sold,
      quantity_available = excluded.quantity_available,
      image_urls_json = excluded.image_urls_json,
      variation_count = excluded.variation_count,
      out_of_stock_control = excluded.out_of_stock_control,
      supported = excluded.supported,
      unsupported_reasons_json = excluded.unsupported_reasons_json,
      fetched_at = excluded.fetched_at
  `).run(
    snapshot.itemId,
    snapshot.sku,
    snapshot.title,
    snapshot.listingUrl,
    snapshot.listingType,
    snapshot.listingStatus,
    snapshot.listingDuration,
    snapshot.conditionId,
    snapshot.conditionName,
    snapshot.conditionDescription,
    snapshot.price,
    snapshot.currency,
    snapshot.quantityTotal,
    snapshot.quantitySold,
    snapshot.quantityAvailable,
    JSON.stringify(snapshot.imageUrls),
    snapshot.variationCount,
    snapshot.outOfStockControl === null ? null : snapshot.outOfStockControl ? 1 : 0,
    snapshot.supported ? 1 : 0,
    JSON.stringify(snapshot.unsupportedReasons),
    snapshot.fetchedAt,
  );
}

function mapListing(row: Record<string, unknown>): ListingSnapshot {
  return {
    itemId: asString(row.item_id),
    sku: asNullableString(row.sku),
    title: asString(row.title),
    listingUrl: asString(row.listing_url),
    listingType: asString(row.listing_type),
    listingStatus: asString(row.listing_status),
    listingDuration: asNullableString(row.listing_duration),
    conditionId: asNullableString(row.condition_id),
    conditionName: asNullableString(row.condition_name),
    conditionDescription: asNullableString(row.condition_description),
    price: row.price === null || row.price === undefined ? null : asNumber(row.price),
    currency: asString(row.currency),
    quantityTotal: asNumber(row.quantity_total),
    quantitySold: asNumber(row.quantity_sold),
    quantityAvailable: asNumber(row.quantity_available),
    imageUrls: parseJson<string[]>(row.image_urls_json, []),
    variationCount: asNumber(row.variation_count),
    outOfStockControl:
      row.out_of_stock_control === null || row.out_of_stock_control === undefined
        ? null
        : asNumber(row.out_of_stock_control) === 1,
    supported: asNumber(row.supported) === 1,
    unsupportedReasons: parseJson<string[]>(row.unsupported_reasons_json, []),
    fetchedAt: asString(row.fetched_at),
  };
}

function photosForCopy(copyId: string): TaskPhoto[] {
  const rows = database().prepare(
    "SELECT * FROM photos WHERE copy_id = ? ORDER BY position ASC",
  ).all(copyId) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: asString(row.id),
    copyId: asString(row.copy_id),
    position: asNumber(row.position),
    originalName: asString(row.original_name),
    mimeType: asString(row.mime_type),
    byteSize: asNumber(row.byte_size),
    width: asNumber(row.width),
    height: asNumber(row.height),
    sha256: asString(row.sha256),
    url: `/api/photos/${asString(row.id)}`,
    ebayImageId: asNullableString(row.ebay_image_id),
    ebayImageUrl: asNullableString(row.ebay_image_url),
  }));
}

function mapCopy(row: Record<string, unknown> | undefined): QueuedCopy | null {
  if (!row) return null;
  const id = asString(row.id);
  return {
    id,
    taskId: asString(row.task_id),
    internalReference: asString(row.internal_reference),
    conditionId: asNullableString(row.condition_id),
    conditionName: asNullableString(row.condition_name),
    conditionDescription: asString(row.condition_description),
    status: asString(row.status) as QueuedCopy["status"],
    photos: photosForCopy(id),
    createdAt: asString(row.created_at),
  };
}

function taskFromRow(row: Record<string, unknown>): RestockTask {
  const listing = mapListing(row);
  const copy = database().prepare(
    "SELECT * FROM copies WHERE task_id = ? AND status IN ('queued', 'applying', 'failed') ORDER BY created_at ASC LIMIT 1",
  ).get(asString(row.task_id)) as Record<string, unknown> | undefined;
  return {
    id: asString(row.task_id),
    itemId: asString(row.item_id),
    status: asString(row.task_status) as TaskStatus,
    listing,
    queuedCopy: mapCopy(copy),
    armedQuantitySold: asNumber(row.armed_quantity_sold),
    lastSeenQuantitySold: asNumber(row.last_seen_quantity_sold),
    lastSeenQuantityAvailable: asNumber(row.last_seen_quantity_available),
    lastCheckedAt: asNullableString(row.last_checked_at),
    lastError: asNullableString(row.last_error),
    createdAt: asString(row.task_created_at),
    updatedAt: asString(row.task_updated_at),
  };
}

const TASK_SELECT = `
  SELECT
    t.id AS task_id,
    t.status AS task_status,
    t.armed_quantity_sold,
    t.last_seen_quantity_sold,
    t.last_seen_quantity_available,
    t.last_checked_at,
    t.last_error,
    t.created_at AS task_created_at,
    t.updated_at AS task_updated_at,
    l.*
  FROM restock_tasks t
  JOIN listings l ON l.item_id = t.item_id
`;

export function listTasks(): RestockTask[] {
  const rows = database().prepare(`${TASK_SELECT} ORDER BY t.created_at DESC`).all() as Record<
    string,
    unknown
  >[];
  return rows.map(taskFromRow);
}

export function getTask(taskId: string): RestockTask | null {
  const row = database().prepare(`${TASK_SELECT} WHERE t.id = ?`).get(taskId) as
    | Record<string, unknown>
    | undefined;
  return row ? taskFromRow(row) : null;
}

export function createTask(input: {
  taskId: string;
  copyId: string;
  snapshot: ListingSnapshot;
  internalReference: string;
  conditionDescription: string;
  images: StoredImage[];
}): RestockTask {
  const db = database();
  const timestamp = now();
  const armedQuantitySold =
    input.snapshot.quantityAvailable === 0
      ? input.snapshot.quantitySold
      : input.snapshot.quantitySold + 1;
  db.exec("BEGIN IMMEDIATE");
  try {
    upsertListing(input.snapshot);
    const existing = db.prepare("SELECT id FROM restock_tasks WHERE item_id = ?").get(
      input.snapshot.itemId,
    );
    if (existing) throw new Error("A restock task already exists for this listing");

    db.prepare(`
      INSERT INTO restock_tasks (
        id, item_id, status, armed_quantity_sold, last_seen_quantity_sold,
        last_seen_quantity_available, created_at, updated_at
      ) VALUES (?, ?, 'active', ?, ?, ?, ?, ?)
    `).run(
      input.taskId,
      input.snapshot.itemId,
      armedQuantitySold,
      input.snapshot.quantitySold,
      input.snapshot.quantityAvailable,
      timestamp,
      timestamp,
    );
    db.prepare(`
      INSERT INTO copies (
        id, task_id, internal_reference, condition_id, condition_name,
        condition_description, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)
    `).run(
      input.copyId,
      input.taskId,
      input.internalReference,
      input.snapshot.conditionId,
      input.snapshot.conditionName,
      input.conditionDescription,
      timestamp,
      timestamp,
    );
    const insertPhoto = db.prepare(`
      INSERT INTO photos (
        id, copy_id, position, storage_key, original_name, mime_type,
        byte_size, width, height, sha256, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    input.images.forEach((image, index) => {
      insertPhoto.run(
        randomUUID(),
        input.copyId,
        index,
        image.storageKey,
        image.originalName,
        image.mimeType,
        image.byteSize,
        image.width,
        image.height,
        image.sha256,
        timestamp,
      );
    });
    appendActivity({
      taskId: input.taskId,
      type: "task_activated",
      level: "success",
      message: `Restock task activated for ${input.snapshot.title}`,
      details: {
        itemId: input.snapshot.itemId,
        armedQuantitySold,
        listingWasAlreadyAtZero: input.snapshot.quantityAvailable === 0,
        queuedCopy: input.internalReference,
        photoCount: input.images.length,
      },
      dedupeKey: `task-created:${input.taskId}`,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const created = getTask(input.taskId);
  if (!created) throw new Error("Task was not created");
  return created;
}

export function addQueuedCopy(input: {
  taskId: string;
  copyId: string;
  snapshot: ListingSnapshot;
  internalReference: string;
  conditionDescription: string;
  images: StoredImage[];
}): RestockTask {
  const current = getTask(input.taskId);
  if (!current) throw new Error("Restock task not found");
  if (current.queuedCopy) throw new Error("This task already has a queued copy");
  if (current.itemId !== input.snapshot.itemId) throw new Error("Listing does not match the task");

  const db = database();
  const timestamp = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    upsertListing(input.snapshot);
    db.prepare(`
      INSERT INTO copies (
        id, task_id, internal_reference, condition_id, condition_name,
        condition_description, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)
    `).run(
      input.copyId,
      input.taskId,
      input.internalReference,
      input.snapshot.conditionId,
      input.snapshot.conditionName,
      input.conditionDescription,
      timestamp,
      timestamp,
    );
    const insertPhoto = db.prepare(`
      INSERT INTO photos (
        id, copy_id, position, storage_key, original_name, mime_type,
        byte_size, width, height, sha256, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    input.images.forEach((image, index) => {
      insertPhoto.run(
        randomUUID(),
        input.copyId,
        index,
        image.storageKey,
        image.originalName,
        image.mimeType,
        image.byteSize,
        image.width,
        image.height,
        image.sha256,
        timestamp,
      );
    });
    db.prepare(`
      UPDATE restock_tasks SET
        status = 'active',
        last_seen_quantity_sold = ?,
        last_seen_quantity_available = ?,
        last_checked_at = ?,
        last_error = NULL,
        updated_at = ?
      WHERE id = ?
    `).run(
      input.snapshot.quantitySold,
      input.snapshot.quantityAvailable,
      input.snapshot.fetchedAt,
      timestamp,
      input.taskId,
    );
    appendActivity({
      taskId: input.taskId,
      type: "copy_queued",
      level: "success",
      message: `${input.internalReference} queued with ${input.images.length} photos`,
      details: {
        itemId: input.snapshot.itemId,
        copyId: input.copyId,
        photoCount: input.images.length,
        listingAtZero: input.snapshot.quantityAvailable === 0,
      },
      dedupeKey: `copy-queued:${input.copyId}`,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const updated = getTask(input.taskId);
  if (!updated) throw new Error("Queued copy was not saved");
  return updated;
}

export function appendActivity(input: {
  taskId?: string | null;
  type: string;
  level: ActivityEvent["level"];
  message: string;
  details?: Record<string, unknown>;
  dedupeKey?: string | null;
}) {
  database().prepare(`
    INSERT OR IGNORE INTO activity_events (
      task_id, type, level, message, details_json, dedupe_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.taskId ?? null,
    input.type,
    input.level,
    input.message,
    JSON.stringify(input.details ?? {}),
    input.dedupeKey ?? null,
    now(),
  );
}

export function listActivity(limit = 100): ActivityEvent[] {
  const rows = database().prepare(
    "SELECT * FROM activity_events ORDER BY id DESC LIMIT ?",
  ).all(Math.max(1, Math.min(500, limit))) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: asNumber(row.id),
    taskId: asNullableString(row.task_id),
    type: asString(row.type),
    level: asString(row.level) as ActivityEvent["level"],
    message: asString(row.message),
    details: parseJson<Record<string, unknown>>(row.details_json, {}),
    createdAt: asString(row.created_at),
  }));
}

export function photoStorageRecord(photoId: string): { storageKey: string; mimeType: string } | null {
  const row = database().prepare("SELECT storage_key, mime_type FROM photos WHERE id = ?").get(
    photoId,
  ) as Record<string, unknown> | undefined;
  return row ? { storageKey: asString(row.storage_key), mimeType: asString(row.mime_type) } : null;
}

export function activeTaskIds(): string[] {
  const rows = database().prepare(
    "SELECT id FROM restock_tasks WHERE status NOT IN ('paused') ORDER BY created_at ASC",
  ).all() as Record<string, unknown>[];
  return rows.map((row) => asString(row.id));
}

export function recordObservation(taskId: string, snapshot: ListingSnapshot) {
  const db = database();
  db.exec("BEGIN IMMEDIATE");
  try {
    upsertListing(snapshot);
    db.prepare(`
      UPDATE restock_tasks SET
        last_seen_quantity_sold = ?,
        last_seen_quantity_available = ?,
        last_checked_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      snapshot.quantitySold,
      snapshot.quantityAvailable,
      snapshot.fetchedAt,
      now(),
      taskId,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function setTaskStatus(taskId: string, status: TaskStatus, error: string | null = null) {
  database().prepare(
    "UPDATE restock_tasks SET status = ?, last_error = ?, updated_at = ? WHERE id = ?",
  ).run(status, error, now(), taskId);
}

export interface HandoffRun {
  id: string;
  taskId: string;
  triggerQuantitySold: number;
  status: string;
  ebayPictureUrls: string[];
  error: string | null;
}

export function getOrCreateHandoffRun(taskId: string, triggerQuantitySold: number): HandoffRun {
  const db = database();
  const timestamp = now();
  db.prepare(`
    INSERT OR IGNORE INTO handoff_runs (
      id, task_id, trigger_quantity_sold, status, ebay_picture_urls_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, 'created', '[]', ?, ?)
  `).run(randomUUID(), taskId, triggerQuantitySold, timestamp, timestamp);
  const row = db.prepare(
    "SELECT * FROM handoff_runs WHERE task_id = ? AND trigger_quantity_sold = ?",
  ).get(taskId, triggerQuantitySold) as Record<string, unknown>;
  return {
    id: asString(row.id),
    taskId: asString(row.task_id),
    triggerQuantitySold: asNumber(row.trigger_quantity_sold),
    status: asString(row.status),
    ebayPictureUrls: parseJson<string[]>(row.ebay_picture_urls_json, []),
    error: asNullableString(row.error),
  };
}

export function updateHandoffRun(
  runId: string,
  input: { status: string; ebayPictureUrls?: string[]; error?: string | null },
) {
  database().prepare(`
    UPDATE handoff_runs SET
      status = ?,
      ebay_picture_urls_json = COALESCE(?, ebay_picture_urls_json),
      error = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    input.status,
    input.ebayPictureUrls ? JSON.stringify(input.ebayPictureUrls) : null,
    input.error ?? null,
    now(),
    runId,
  );
}

export function recordPhotoEbayUpload(photoId: string, imageId: string, imageUrl: string) {
  database().prepare(
    "UPDATE photos SET ebay_image_id = ?, ebay_image_url = ? WHERE id = ?",
  ).run(imageId, imageUrl, photoId);
}

export function completeHandoff(input: {
  taskId: string;
  copyId: string;
  runId: string;
  snapshot: ListingSnapshot;
}) {
  const db = database();
  const timestamp = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    upsertListing(input.snapshot);
    db.prepare(
      "UPDATE copies SET status = 'archived', updated_at = ? WHERE task_id = ? AND status = 'live'",
    ).run(timestamp, input.taskId);
    db.prepare("UPDATE copies SET status = 'live', updated_at = ? WHERE id = ?").run(
      timestamp,
      input.copyId,
    );
    db.prepare(`
      UPDATE restock_tasks SET
        status = 'attention',
        armed_quantity_sold = ?,
        last_seen_quantity_sold = ?,
        last_seen_quantity_available = ?,
        last_checked_at = ?,
        last_error = NULL,
        updated_at = ?
      WHERE id = ?
    `).run(
      input.snapshot.quantitySold + 1,
      input.snapshot.quantitySold,
      input.snapshot.quantityAvailable,
      input.snapshot.fetchedAt,
      timestamp,
      input.taskId,
    );
    updateHandoffRun(input.runId, { status: "completed", error: null });
    appendActivity({
      taskId: input.taskId,
      type: "restock_completed",
      level: "success",
      message: "Queued copy is live on eBay; queue now needs another copy",
      details: {
        itemId: input.snapshot.itemId,
        quantityAvailable: input.snapshot.quantityAvailable,
        quantitySold: input.snapshot.quantitySold,
        copyId: input.copyId,
      },
      dedupeKey: `restock-complete:${input.runId}`,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
