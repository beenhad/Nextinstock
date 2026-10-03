import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const children = [
  spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1"], { stdio: "inherit" }),
  spawn(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), "scripts/restock-worker.ts"], { stdio: "inherit" }),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) child.on("exit", (code) => {
  if (!stopping && code) process.exitCode = code;
  stop();
});
console.log("Nextinstock runs at http://127.0.0.1:3000/tool while this terminal stays open.");
