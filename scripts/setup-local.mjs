import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const dataPath = process.platform === "darwin"
  ? path.join(os.homedir(), "Library", "Application Support", "Nextinstock")
  : path.join(os.homedir(), ".local", "share", "nextinstock");
mkdirSync(dataPath, { recursive: true, mode: 0o700 });

if (!existsSync(envPath)) {
  const example = readFileSync(path.join(root, ".env.example"), "utf8");
  const configured = example.replace(/^NEXTINSTOCK_DATA_DIR=.*$/m, `NEXTINSTOCK_DATA_DIR="${dataPath}"`);
  writeFileSync(envPath, configured, { mode: 0o600 });
  console.log(`Created .env.local with data stored at ${dataPath}`);
} else {
  console.log("Kept existing .env.local unchanged.");
}

if (existsSync(path.join(root, ".nextinstock"))) {
  console.log("Existing .nextinstock data found. Back it up and migrate it before changing NEXTINSTOCK_DATA_DIR.");
}
console.log("Next: add your own eBay developer credentials to .env.local, then run npm run build and npm run start:local.");
