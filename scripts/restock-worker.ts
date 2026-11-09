import { setTimeout as delay } from "node:timers/promises";
import { recordWorkerHeartbeat } from "../src/lib/server/database";
import { pollSeconds, systemStatus } from "../src/lib/server/config";
import { processAllTasks } from "../src/lib/server/restock-worker";

const runOnce = process.argv.includes("--once");
let shuttingDown = false;
const shutdown = new AbortController();

async function tick() {
  const startedAt = new Date().toISOString();
  try {
    const results = await processAllTasks(() => shuttingDown);
    const summary = results.map((result) => `${result.taskId}:${result.action}`).join(", ");
    console.log(`[${startedAt}] checked ${results.length} task(s)${summary ? ` — ${summary}` : ""}`);
  } catch (error) {
    console.error(`[${startedAt}] worker tick failed`, error);
  }
}

async function main() {
  const status = systemStatus();
  console.log(
    `Nextinstock worker started (${status.writeMode}, ${status.pollSeconds}s, ${status.storagePath})`,
  );
  if (!runOnce) recordWorkerHeartbeat("running");
  const heartbeat = setInterval(() => { if (!runOnce) recordWorkerHeartbeat("running"); }, 15_000);
  heartbeat.unref();
  try {
  await tick();
  if (runOnce) return;

  while (!shuttingDown) {
    await delay(pollSeconds() * 1000, undefined, { signal: shutdown.signal }).catch(() => {});
    if (!shuttingDown) await tick();
  }
  } finally { clearInterval(heartbeat); if (!runOnce) recordWorkerHeartbeat("stopped"); }
}

process.on("SIGINT", () => {
  shuttingDown = true;
  shutdown.abort();
});
process.on("SIGTERM", () => {
  shuttingDown = true;
  shutdown.abort();
});

void main();
