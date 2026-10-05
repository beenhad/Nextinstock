import { randomUUID } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  PriceRule,
  ActivityEvent,
  ListingSnapshot,
  QueuedCopy,
  RestockTask,
  TaskPhoto,
  TaskStatus,
} from "@/lib/types";
import { clampRestockDelay, dataDirectory } from "./config";
import { assertTargetPrice } from "./price";
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
      variations_json TEXT NOT NULL DEFAULT '[]',
      variation_picture_axis TEXT,
      out_of_stock_control INTEGER,
      supported INTEGER NOT NULL,
      unsupported_reasons_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS restock_tasks (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES listings(item_id) ON DELETE CASCADE,
      variation_key TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      armed_quantity_sold INTEGER NOT NULL,
      last_seen_quantity_sold INTEGER NOT NULL,
      last_seen_quantity_available INTEGER NOT NULL,
      last_checked_at TEXT,
      last_error TEXT,
      lease_owner TEXT,
      lease_expires_at TEXT,
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
      target_price REAL,
      queue_position INTEGER,
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
      execute_after TEXT,
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

    CREATE TABLE IF NOT EXISTS discord_notifications (
      event_key TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT
    );
  `);
  const listingColumns = db.prepare("PRAGMA table_info(listings)").all() as Array<{
    name?: string;
  }>;
  if (!listingColumns.some((column) => column.name === "out_of_stock_control")) {
    db.exec("ALTER TABLE listings ADD COLUMN out_of_stock_control INTEGER");
  }
  if (!listingColumns.some((column) => column.name === "variations_json")) {
    db.exec("ALTER TABLE listings ADD COLUMN variations_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!listingColumns.some((column) => column.name === "variation_picture_axis")) {
    db.exec("ALTER TABLE listings ADD COLUMN variation_picture_axis TEXT");
  }
  const taskColumns = db.prepare("PRAGMA table_info(restock_tasks)").all() as Array<{ name?: string }>;
  if (!taskColumns.some((column) => column.name === "lease_owner")) {
    db.exec("ALTER TABLE restock_tasks ADD COLUMN lease_owner TEXT");
  }
  if (!taskColumns.some((column) => column.name === "lease_expires_at")) {
    db.exec("ALTER TABLE restock_tasks ADD COLUMN lease_expires_at TEXT");
  }
  if (!taskColumns.some((column) => column.name === "variation_key")) {
    // Old SQLite schema made item_id unique. Rebuild it to allow one task per variation.
    db.exec("PRAGMA foreign_keys = OFF");
    try {
      db.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE restock_tasks_new (
          id TEXT PRIMARY KEY,
          item_id TEXT NOT NULL REFERENCES listings(item_id) ON DELETE CASCADE,
          variation_key TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL,
          armed_quantity_sold INTEGER NOT NULL,
          last_seen_quantity_sold INTEGER NOT NULL,
          last_seen_quantity_available INTEGER NOT NULL,
          last_checked_at TEXT,
          last_error TEXT,
          lease_owner TEXT,
          lease_expires_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(item_id, variation_key)
        );
        INSERT INTO restock_tasks_new (
          id, item_id, status, armed_quantity_sold, last_seen_quantity_sold,
          last_seen_quantity_available, last_checked_at, last_error,
          lease_owner, lease_expires_at, created_at, updated_at
        ) SELECT id, item_id, status, armed_quantity_sold, last_seen_quantity_sold,
          last_seen_quantity_available, last_checked_at, last_error,
          lease_owner, lease_expires_at, created_at, updated_at FROM restock_tasks;
        DROP TABLE restock_tasks;
        ALTER TABLE restock_tasks_new RENAME TO restock_tasks;
        COMMIT;
      `);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      db.exec("PRAGMA foreign_keys = ON");
    }
  }
  const copyColumns = db.prepare("PRAGMA table_info(copies)").all() as Array<{ name?: string }>;
  if (!copyColumns.some((column) => column.name === "target_price")) {
    db.exec("ALTER TABLE copies ADD COLUMN target_price REAL");
  }
  if (!copyColumns.some((column) => column.name === "queue_position")) {
    db.exec("ALTER TABLE copies ADD COLUMN queue_position INTEGER");
  }
  db.exec("UPDATE copies SET queue_position = rowid WHERE queue_position IS NULL");
  const handoffColumns = db.prepare("PRAGMA table_info(handoff_runs)").all() as Array<{ name?: string }>;
  if (!handoffColumns.some((column) => column.name === "execute_after")) {
    db.exec("ALTER TABLE handoff_runs ADD COLUMN execute_after TEXT");
  }
  const settingsColumns = db.prepare("PRAGMA table_info(restock_tasks)").all() as Array<{ name?: string }>;
  if (!settingsColumns.some((column) => column.name === "restock_delay_seconds")) {
    db.exec("ALTER TABLE restock_tasks ADD COLUMN restock_delay_seconds INTEGER");
  }
  if (!settingsColumns.some((column) => column.name === "price_rule_json")) {
    db.exec("ALTER TABLE restock_tasks ADD COLUMN price_rule_json TEXT");
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS restock_tasks_item_variation_idx ON restock_tasks(item_id, variation_key)");
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
      variations_json, variation_picture_axis, unsupported_reasons_json, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      variations_json = excluded.variations_json,
      variation_picture_axis = excluded.variation_picture_axis,
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
    JSON.stringify(snapshot.variations),
    snapshot.variationPictureAxis,
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
    variations: parseJson(row.variations_json, []),
    variationPictureAxis: asNullableString(row.variation_picture_axis),
    outOfStockControl:
      row.out_of_stock_control === null || row.out_of_stock_control === undefined
        ? null
        : asNumber(row.out_of_stock_control) === 1,
    supported: asNumber(row.supported) === 1,
    unsupportedReasons: parseJson<string[]>(row.unsupported_reasons_json, []),
    fetchedAt: asString(row.fetched_at),
  };
}

export function latestListingWithImage(): ListingSnapshot | null {
  const rows = database().prepare(
    "SELECT * FROM listings WHERE image_urls_json != '[]' ORDER BY fetched_at DESC",
  ).all() as Record<string, unknown>[];
  for (const row of rows) {
    const listing = mapListing(row);
    if (listing.imageUrls.some((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && (url.hostname === "ebayimg.com" || url.hostname.endsWith(".ebayimg.com"));
      } catch { return false; }
    })) return listing;
  }
  return null;
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
    queuePosition: asNumber(row.queue_position),
    internalReference: asString(row.internal_reference),
    targetPrice: row.target_price === null || row.target_price === undefined ? null : asNumber(row.target_price),
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
  const copyRows = database().prepare(
    "SELECT * FROM copies WHERE task_id = ? AND status IN ('queued', 'applying', 'failed') ORDER BY queue_position ASC, created_at ASC, rowid ASC",
  ).all(asString(row.task_id)) as Record<string, unknown>[];
  const queuedCopies = copyRows.map((copy) => mapCopy(copy)).filter((copy): copy is QueuedCopy => Boolean(copy));
  return {
    id: asString(row.task_id),
    itemId: asString(row.item_id),
    variationKey: asNullableString(row.variation_key),
    status: asString(row.task_status) as TaskStatus,
    restockDelaySeconds: row.restock_delay_seconds === null || row.restock_delay_seconds === undefined ? null : asNumber(row.restock_delay_seconds),
    priceRule: row.price_rule_json ? parseJson<PriceRule | null>(row.price_rule_json, null) : null,
    listing,
    queuedCopy: queuedCopies[0] ?? null,
    queuedCopies,
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
    t.variation_key,
    t.status AS task_status,
    t.restock_delay_seconds,
    t.price_rule_json,
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

const TASK_LEASE_MS = 15 * 60 * 1000;

export function acquireTaskLease(taskId: string, owner: string): boolean {
  const timestamp = now();
  const expiresAt = new Date(Date.now() + TASK_LEASE_MS).toISOString();
  const result = database().prepare(`
    UPDATE restock_tasks SET lease_owner = ?, lease_expires_at = ?
    WHERE id = ? AND (lease_owner IS NULL OR lease_expires_at <= ?)
      AND NOT EXISTS (
        SELECT 1 FROM restock_tasks other
        WHERE other.item_id = restock_tasks.item_id AND other.id != restock_tasks.id
          AND other.lease_owner IS NOT NULL AND other.lease_expires_at > ?
      )
  `).run(owner, expiresAt, taskId, timestamp, timestamp);
  return result.changes === 1;
}

export function renewTaskLease(taskId: string, owner: string) {
  const result = database().prepare(`
    UPDATE restock_tasks SET lease_expires_at = ?
    WHERE id = ? AND lease_owner = ? AND lease_expires_at > ?
  `).run(new Date(Date.now() + TASK_LEASE_MS).toISOString(), taskId, owner, now());
  if (result.changes !== 1) throw new Error("Task check lost its execution lease");
}

export function releaseTaskLease(taskId: string, owner: string) {
  database().prepare(`
    UPDATE restock_tasks SET lease_owner = NULL, lease_expires_at = NULL
    WHERE id = ? AND lease_owner = ?
  `).run(taskId, owner);
}

export function createTask(input: {
  taskId: string;
  copyId: string;
  snapshot: ListingSnapshot;
  variationKey?: string | null;
  internalReference: string;
  conditionDescription: string;
  targetPrice?: number | null;
  images: StoredImage[];
}): RestockTask {
  const db = database();
  const timestamp = now();
  const variationKey = input.variationKey ?? null;
  const variation = variationKey ? input.snapshot.variations.find((candidate) => candidate.key === variationKey) : null;
  if (input.snapshot.variations.length && !variation) throw new Error("Select a valid variation");
  if (!input.snapshot.variations.length && variationKey) throw new Error("This listing has no variations");
  const selected = variation ?? input.snapshot;
  const targetPrice = assertTargetPrice(input.targetPrice);
  const armedQuantitySold =
    selected.quantityAvailable === 0
      ? selected.quantitySold
      : selected.quantitySold + selected.quantityAvailable;
  db.exec("BEGIN IMMEDIATE");
  try {
    upsertListing(input.snapshot);
    const existing = db.prepare("SELECT id FROM restock_tasks WHERE item_id = ? AND variation_key = ?").get(
      input.snapshot.itemId, variationKey ?? "",
    );
    if (existing) throw new Error("A restock task already exists for this listing");

    db.prepare(`
      INSERT INTO restock_tasks (
        id, item_id, variation_key, status, armed_quantity_sold, last_seen_quantity_sold,
        last_seen_quantity_available, created_at, updated_at
      ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)
    `).run(
      input.taskId,
      input.snapshot.itemId,
      variationKey ?? "",
      armedQuantitySold,
      selected.quantitySold,
      selected.quantityAvailable,
      timestamp,
      timestamp,
    );
    db.prepare(`
      INSERT INTO copies (
        id, task_id, internal_reference, condition_id, condition_name,
        condition_description, target_price, queue_position, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'queued', ?, ?)
    `).run(
      input.copyId,
      input.taskId,
      input.internalReference,
      input.snapshot.conditionId,
      input.snapshot.conditionName,
      input.conditionDescription,
      targetPrice,
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
        variationKey,
        listingWasAlreadyAtZero: selected.quantityAvailable === 0,
        queuedCopy: input.internalReference,
        photoCount: input.images.length,
        targetPrice,
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
  targetPrice?: number | null;
  images: StoredImage[];
}): RestockTask {
  const current = getTask(input.taskId);
  if (!current) throw new Error("Restock task not found");
  if (current.queuedCopies.length >= 100) throw new Error("A task can queue at most 100 copies");
  if (current.itemId !== input.snapshot.itemId) throw new Error("Listing does not match the task");
  if (current.variationKey && !input.snapshot.variations.some((variation) => variation.key === current.variationKey)) {
    throw new Error("The selected variation is no longer on eBay");
  }

  const db = database();
  const timestamp = now();
  const targetPrice = assertTargetPrice(input.targetPrice);
  db.exec("BEGIN IMMEDIATE");
  try {
    upsertListing(input.snapshot);
    const queuePosition = asNumber((db.prepare(
      "SELECT COALESCE(MAX(queue_position), 0) + 1 AS next_position FROM copies WHERE task_id = ?",
    ).get(input.taskId) as Record<string, unknown>).next_position);
    const hadQueuedCopy = Boolean(db.prepare(
      "SELECT id FROM copies WHERE task_id = ? AND status IN ('queued', 'applying', 'failed') LIMIT 1",
    ).get(input.taskId));
    db.prepare(`
      INSERT INTO copies (
        id, task_id, internal_reference, condition_id, condition_name,
        condition_description, target_price, queue_position, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)
    `).run(
      input.copyId,
      input.taskId,
      input.internalReference,
      input.snapshot.conditionId,
      input.snapshot.conditionName,
      input.conditionDescription,
      targetPrice,
      queuePosition,
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
    if (!hadQueuedCopy) {
      const selected = input.snapshot.variations.find((variation) => variation.key === current.variationKey) ?? input.snapshot;
      db.prepare(`
        UPDATE restock_tasks SET
          status = 'active',
          last_seen_quantity_sold = ?,
          last_seen_quantity_available = ?,
          last_checked_at = ?,
          last_error = NULL,
          updated_at = ?
        WHERE id = ?
      `).run(selected.quantitySold, selected.quantityAvailable, input.snapshot.fetchedAt, timestamp, input.taskId);
    }
    appendActivity({
      taskId: input.taskId,
      type: "copy_queued",
      level: "success",
      message: `${input.internalReference} queued with ${input.images.length} photos`,
      details: {
        itemId: input.snapshot.itemId,
        copyId: input.copyId,
        photoCount: input.images.length,
        targetPrice,
        queuePosition,
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

export function updateQueuedCopyPrice(taskId: string, copyId: string, targetPrice: number | null): RestockTask {
  const price = assertTargetPrice(targetPrice);
  const db = database();
  const timestamp = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    const task = db.prepare("SELECT lease_owner, lease_expires_at FROM restock_tasks WHERE id = ?").get(taskId) as Record<string, unknown> | undefined;
    if (!task) throw new Error("Restock task not found");
    if (task.lease_owner && asString(task.lease_expires_at) > timestamp) throw new Error("Wait for the current restock check to finish");
    const result = db.prepare(`
      UPDATE copies SET target_price = ?, updated_at = ?
      WHERE id = ? AND task_id = ? AND status = 'queued'
    `).run(price, timestamp, copyId, taskId);
    if (result.changes !== 1) throw new Error("Queued copy not found or already in use");
    appendActivity({ taskId, type: "queued_price_updated", level: "info", message: price === null ? "Queued copy will keep the live eBay price" : `Queued copy price set to ${price.toFixed(2)}`, details: { copyId, targetPrice: price } });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const updated = getTask(taskId);
  if (!updated) throw new Error("Restock task not found");
  return updated;
}

function assertQueueEditable(db: ReturnType<typeof database>, taskId: string, timestamp: string, lockScheduled: boolean) {
  const task = db.prepare("SELECT status, variation_key, lease_owner, lease_expires_at FROM restock_tasks WHERE id = ?").get(taskId) as Record<string, unknown> | undefined;
  if (!task) throw new Error("Restock task not found");
  if (task.lease_owner && asString(task.lease_expires_at) > timestamp) throw new Error("Wait for the current restock check to finish");
  if (lockScheduled && asString(task.status) === "scheduled") throw new Error("Queue is locked during a restock handoff");
  return { variationKey: task.variation_key ? asString(task.variation_key) : null };
}

export function updateQueuedCopyDetails(
  taskId: string,
  copyId: string,
  input: { internalReference?: string; conditionDescription?: string },
): RestockTask {
  const reference = input.internalReference?.trim();
  const note = input.conditionDescription?.trim();
  if (reference !== undefined && (reference.length < 1 || reference.length > 100)) throw new Error("Internal reference must be 1 to 100 characters");
  if (note !== undefined && note.length > 1000) throw new Error("Condition note must be 1,000 characters or fewer");
  if (reference === undefined && note === undefined) throw new Error("Nothing to update");
  const db = database();
  const timestamp = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    const { variationKey } = assertQueueEditable(db, taskId, timestamp, false);
    const hasPhotos = Boolean(db.prepare("SELECT 1 FROM photos WHERE copy_id = ? LIMIT 1").get(copyId));
    if (!variationKey && hasPhotos && note === "") throw new Error("Add the exact condition note");
    const result = db.prepare(`
      UPDATE copies SET
        internal_reference = COALESCE(?, internal_reference),
        condition_description = COALESCE(?, condition_description),
        updated_at = ?
      WHERE id = ? AND task_id = ? AND status = 'queued'
    `).run(reference ?? null, note ?? null, timestamp, copyId, taskId);
    if (result.changes !== 1) throw new Error("Queued copy not found or already in use");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const updated = getTask(taskId);
  if (!updated) throw new Error("Restock task not found");
  return updated;
}

export function removeQueuedCopy(taskId: string, copyId: string): RestockTask {
  const db = database();
  const timestamp = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    assertQueueEditable(db, taskId, timestamp, true);
    const result = db.prepare(`
      UPDATE copies SET status = 'archived', queue_position = NULL, updated_at = ?
      WHERE id = ? AND task_id = ? AND status = 'queued'
    `).run(timestamp, copyId, taskId);
    if (result.changes !== 1) throw new Error("Queued copy not found or already in use");
    appendActivity({ taskId, type: "queued_copy_removed", level: "info", message: "Queued copy removed", details: { copyId } });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const updated = getTask(taskId);
  if (!updated) throw new Error("Restock task not found");
  return updated;
}

export function validatePriceRule(rule: PriceRule | null): PriceRule | null {
  if (rule === null) return null;
  if (rule.mode !== "amount" && rule.mode !== "percent") throw new Error("Price rule must step by an amount or a percent");
  const step = Number(rule.step);
  if (!Number.isFinite(step) || Math.abs(step) > (rule.mode === "percent" ? 100 : 100000)) throw new Error("Price step is out of range");
  const cap = rule.cap === null || rule.cap === undefined ? null : Number(rule.cap);
  if (cap !== null && (!Number.isFinite(cap) || cap <= 0)) throw new Error("Price cap must be a positive number");
  return { mode: rule.mode, step: Math.round(step * 100) / 100, cap: cap === null ? null : Math.round(cap * 100) / 100 };
}

export function updateTaskSettings(
  taskId: string,
  input: { restockDelaySeconds?: number | null; priceRule?: PriceRule | null },
): RestockTask {
  const db = database();
  const sets: string[] = [];
  const values: Array<string | number | null> = [];
  if (input.restockDelaySeconds !== undefined) {
    const delay = input.restockDelaySeconds;
    if (delay !== null && !Number.isFinite(Number(delay))) throw new Error("Restock delay must be a number of seconds");
    sets.push("restock_delay_seconds = ?");
    values.push(delay === null ? null : clampRestockDelay(Number(delay)));
  }
  if (input.priceRule !== undefined) {
    const rule = validatePriceRule(input.priceRule);
    sets.push("price_rule_json = ?");
    values.push(rule ? JSON.stringify(rule) : null);
  }
  if (!sets.length) throw new Error("Nothing to update");
  const result = db.prepare(`UPDATE restock_tasks SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`).run(...values, now(), taskId);
  if (result.changes !== 1) throw new Error("Restock task not found");
  const updated = getTask(taskId);
  if (!updated) throw new Error("Restock task not found");
  return updated;
}

/** Replace the order of every queued copy at once (drag-and-drop). */
export function reorderQueuedCopies(taskId: string, copyIds: string[]): RestockTask {
  const db = database();
  const timestamp = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    const task = db.prepare("SELECT status, lease_owner, lease_expires_at FROM restock_tasks WHERE id = ?").get(taskId) as Record<string, unknown> | undefined;
    if (!task) throw new Error("Restock task not found");
    if (asString(task.status) === "scheduled" || (task.lease_owner && asString(task.lease_expires_at) > timestamp)) {
      throw new Error("Queue order is locked during a restock handoff");
    }
    const rows = db.prepare("SELECT id FROM copies WHERE task_id = ? AND status = 'queued'").all(taskId) as Record<string, unknown>[];
    const current = new Set(rows.map((row) => asString(row.id)));
    if (copyIds.length !== current.size || new Set(copyIds).size !== copyIds.length || copyIds.some((id) => !current.has(id))) {
      throw new Error("The queue changed. Refresh and try again.");
    }
    const update = db.prepare("UPDATE copies SET queue_position = ?, updated_at = ? WHERE id = ? AND task_id = ?");
    copyIds.forEach((id, index) => update.run(index + 1, timestamp, id, taskId));
    appendActivity({ taskId, type: "queued_copy_moved", level: "info", message: "Queued copy order changed", details: { copyIds } });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const updated = getTask(taskId);
  if (!updated) throw new Error("Restock task not found");
  return updated;
}

/** Set several queued prices in one transaction (used when a price rule is applied). */
export function setQueuedCopyPrices(taskId: string, prices: Array<{ copyId: string; targetPrice: number | null }>): RestockTask {
  const db = database();
  const timestamp = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    const task = db.prepare("SELECT lease_owner, lease_expires_at FROM restock_tasks WHERE id = ?").get(taskId) as Record<string, unknown> | undefined;
    if (!task) throw new Error("Restock task not found");
    if (task.lease_owner && asString(task.lease_expires_at) > timestamp) throw new Error("Wait for the current restock check to finish");
    const update = db.prepare("UPDATE copies SET target_price = ?, updated_at = ? WHERE id = ? AND task_id = ? AND status = 'queued'");
    for (const entry of prices) {
      const result = update.run(assertTargetPrice(entry.targetPrice), timestamp, entry.copyId, taskId);
      if (result.changes !== 1) throw new Error("Queued copy not found or already in use");
    }
    appendActivity({ taskId, type: "queued_price_updated", level: "info", message: `Repriced ${prices.length} queued ${prices.length === 1 ? "copy" : "copies"}`, details: { count: prices.length } });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const updated = getTask(taskId);
  if (!updated) throw new Error("Restock task not found");
  return updated;
}

export function moveQueuedCopy(taskId: string, copyId: string, direction: "up" | "down"): RestockTask {
  const db = database();
  const timestamp = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    const task = db.prepare("SELECT status, lease_owner, lease_expires_at FROM restock_tasks WHERE id = ?").get(taskId) as Record<string, unknown> | undefined;
    if (!task) throw new Error("Restock task not found");
    if (asString(task.status) === "scheduled" || (task.lease_owner && asString(task.lease_expires_at) > timestamp)) {
      throw new Error("Queue order is locked during a restock handoff");
    }
    const rows = db.prepare(`
      SELECT id, queue_position FROM copies WHERE task_id = ? AND status = 'queued'
      ORDER BY queue_position ASC, created_at ASC, rowid ASC
    `).all(taskId) as Record<string, unknown>[];
    const index = rows.findIndex((row) => row.id === copyId);
    if (index < 0) throw new Error("Queued copy not found or already in use");
    const other = rows[index + (direction === "up" ? -1 : 1)];
    if (other) {
      const current = rows[index];
      db.prepare("UPDATE copies SET queue_position = ?, updated_at = ? WHERE id = ?")
        .run(asNumber(other.queue_position), timestamp, copyId);
      db.prepare("UPDATE copies SET queue_position = ?, updated_at = ? WHERE id = ?")
        .run(asNumber(current.queue_position), timestamp, asString(other.id));
      appendActivity({ taskId, type: "queued_copy_moved", level: "info", message: "Queued copy order changed", details: { copyId, direction } });
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const updated = getTask(taskId);
  if (!updated) throw new Error("Restock task not found");
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

export function queueDiscordNotification(eventKey: string, payload: Record<string, unknown>) {
  database().prepare(`
    INSERT OR IGNORE INTO discord_notifications (event_key, payload_json, created_at)
    VALUES (?, ?, ?)
  `).run(eventKey, JSON.stringify(payload), now());
}

export function pendingDiscordNotifications(limit = 20): Array<{ eventKey: string; payload: Record<string, unknown> }> {
  const rows = database().prepare(`
    SELECT event_key, payload_json FROM discord_notifications
    WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?
  `).all(limit) as Record<string, unknown>[];
  return rows.map((row) => ({
    eventKey: asString(row.event_key),
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
  }));
}

export function recordDiscordDelivery(eventKey: string, error: string | null) {
  database().prepare(`
    UPDATE discord_notifications SET status = ?, attempts = attempts + 1,
      last_error = ?, sent_at = ? WHERE event_key = ?
  `).run(error ? 'pending' : 'sent', error, error ? null : now(), eventKey);
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
  const task = getTask(taskId);
  if (!task) throw new Error("Task not found");
  const selected = snapshot.variations.find((variation) => variation.key === task.variationKey) ?? snapshot;
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
      selected.quantitySold,
      selected.quantityAvailable,
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
  executeAfter: string | null;
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
    executeAfter: asNullableString(row.execute_after),
    ebayPictureUrls: parseJson<string[]>(row.ebay_picture_urls_json, []),
    error: asNullableString(row.error),
  };
}

export function scheduleHandoffRun(runId: string, executeAfter: string): boolean {
  const result = database().prepare(`
    UPDATE handoff_runs SET status = 'scheduled', execute_after = ?, error = NULL, updated_at = ?
    WHERE id = ? AND status IN ('created', 'blocked', 'dry_run')
  `).run(executeAfter, now(), runId);
  return result.changes === 1;
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
  const task = getTask(input.taskId);
  if (!task) throw new Error("Task not found");
  const selected = input.snapshot.variations.find((variation) => variation.key === task.variationKey) ?? input.snapshot;
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
    const remaining = asNumber((db.prepare(
      "SELECT COUNT(*) AS count FROM copies WHERE task_id = ? AND status IN ('queued', 'applying', 'failed')",
    ).get(input.taskId) as Record<string, unknown>).count);
    db.prepare(`
      UPDATE restock_tasks SET
        status = ?,
        armed_quantity_sold = ?,
        last_seen_quantity_sold = ?,
        last_seen_quantity_available = ?,
        last_checked_at = ?,
        last_error = NULL,
        updated_at = ?
      WHERE id = ?
    `).run(
      remaining > 0 ? "active" : "attention",
      selected.quantitySold + 1,
      selected.quantitySold,
      selected.quantityAvailable,
      input.snapshot.fetchedAt,
      timestamp,
      input.taskId,
    );
    updateHandoffRun(input.runId, { status: "completed", error: null });
    appendActivity({
      taskId: input.taskId,
      type: "restock_completed",
      level: "success",
      message: remaining > 0
        ? `Queued copy is live on eBay; ${remaining} ${remaining === 1 ? "copy remains" : "copies remain"}`
        : "Queued copy is live on eBay; queue now needs another copy",
      details: {
        itemId: input.snapshot.itemId,
        quantityAvailable: input.snapshot.quantityAvailable,
        quantitySold: input.snapshot.quantitySold,
        copyId: input.copyId,
        remainingQueuedCopies: remaining,
      },
      dedupeKey: `restock-complete:${input.runId}`,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
