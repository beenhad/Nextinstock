import { pollSeconds, systemStatus } from "../src/lib/server/config";
import { processAllTasks } from "../src/lib/server/restock-worker";

const runOnce = process.argv.includes("--once");
let shuttingDown = false;

async function tick() {
  const startedAt = new Date().toISOString();
  try {
    const results = await processAllTasks();
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
  await tick();
  if (runOnce) return;

  while (!shuttingDown) {
    await new Promise((resolve) => setTimeout(resolve, pollSeconds() * 1000));
    if (!shuttingDown) await tick();
  }
}

process.on("SIGINT", () => {
  shuttingDown = true;
});
process.on("SIGTERM", () => {
  shuttingDown = true;
});

void main();
