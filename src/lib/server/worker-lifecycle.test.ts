import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

test("idle worker publishes a heartbeat and exits promptly during its polling sleep", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "nextinstock-worker-"));
  const child = spawn(process.execPath, ["--import", "tsx", "scripts/restock-worker.ts"], {
    cwd: process.cwd(), stdio: "ignore",
    env: { ...process.env, NEXTINSTOCK_DATA_DIR: directory, NEXTINSTOCK_EBAY_WRITE_MODE: "dry-run", EBAY_APP_ID: "", EBAY_CERT_ID: "", EBAY_REFRESH_TOKEN: "", SELLERMAID_ENV_FILE: "", NEXTINSTOCK_POLL_SECONDS: "30" },
  });
  const exit = new Promise<number | null>((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); });
  const state = () => {
    try {
      const db = new DatabaseSync(path.join(directory, "nextinstock.sqlite"));
      try { return (db.prepare("SELECT state FROM worker_status WHERE id = 1").get() as { state: string } | undefined)?.state; }
      finally { db.close(); }
    } catch { return undefined; }
  };
  try {
    const deadline = Date.now() + 5000;
    while (state() !== "running" && Date.now() < deadline) await delay(20);
    assert.equal(state(), "running");
    const started = Date.now();
    child.kill("SIGTERM");
    assert.equal(await Promise.race([exit, delay(3000).then(() => "timeout")]), 0);
    assert.ok(Date.now() - started < 3000);
    assert.equal(state(), "stopped");
  } finally { if (child.exitCode === null) child.kill("SIGKILL"); rmSync(directory, { recursive: true, force: true }); }
});
