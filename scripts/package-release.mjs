import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const output = path.join(root, "dist", `Nextinstock-v${version}.zip`);
mkdirSync(path.dirname(output), { recursive: true });
if (existsSync(output)) unlinkSync(output);
const files = [
  ".env.example", "README.md", "INSTALL_WITH_AI.md", "DISCORD_SETUP.md", "DISCORD_TEMPLATE.md",
  "package.json", "package-lock.json", "tsconfig.json", "next-env.d.ts", "next.config.ts",
  "src", "scripts", "skills", "assets", "public",
];
const result = spawnSync("zip", ["-q", "-r", "-X", output, ...files], { cwd: root, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status || 1);
console.log(`Release created: ${output}`);
