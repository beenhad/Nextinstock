import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

test("web and worker processes initialize the same new database concurrently", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "nextinstock-startup-"));
  try {
    const start = () => new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "-e", "require('./src/lib/server/database.ts').listTasks()"], { cwd: process.cwd(), env: { ...process.env, NEXTINSTOCK_DATA_DIR: directory }, stdio: ["ignore", "ignore", "pipe"] });
      let error = "";
      child.stderr.on("data", (chunk) => { error += chunk; });
      child.on("error", reject);
      child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(error)));
    });
    await Promise.all([start(), start()]);
    const db = new DatabaseSync(path.join(directory, "nextinstock.sqlite"));
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("failed migration rolls back schema changes and a repaired database can initialize", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "nextinstock-migration-"));
  process.env.NEXTINSTOCK_DATA_DIR = directory;
  const db = new DatabaseSync(path.join(directory, "nextinstock.sqlite"));
  try {
    db.exec(`CREATE TABLE restock_tasks (id TEXT PRIMARY KEY, item_id TEXT NOT NULL, variation_key TEXT NOT NULL, status TEXT NOT NULL,
      armed_quantity_sold INTEGER NOT NULL, last_seen_quantity_sold INTEGER NOT NULL, last_seen_quantity_available INTEGER NOT NULL,
      last_checked_at TEXT, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    for (const id of ["a", "b"]) db.prepare("INSERT INTO restock_tasks VALUES (?, 'duplicate', '', 'active', 1, 0, 1, NULL, NULL, '', '')").run(id);
    const { listTasks } = await import("./database");
    assert.throws(() => listTasks(), /UNIQUE/);
    assert.equal((db.prepare("PRAGMA table_info(restock_tasks)").all() as Array<{ name: string }>).some((column) => column.name === "lease_owner"), false);
    db.prepare("DELETE FROM restock_tasks WHERE id = 'b'").run();
    assert.doesNotThrow(() => listTasks());
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});
