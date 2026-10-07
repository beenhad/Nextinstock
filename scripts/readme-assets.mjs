// Renders the README header, step cards and restock GIF into .github/readme.
// Usage: node scripts/readme-assets.mjs   (no server needed)
import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, ".github", "readme");
await mkdir(out, { recursive: true });

const themes = {
  light: { ink: "#111214", muted: "#5e6470", card: "#ffffff", line: "#e5e7eb", tints: [["#e8efff", "#174b91"], ["#ffe9ea", "#a7272e"], ["#fff3d6", "#7a5600"], ["#ecf6da", "#3f6813"]] },
  dark: { ink: "#f0f3f6", muted: "#9aa3ae", card: "#161b22", line: "#30363d", tints: [["#1b2a4a", "#9db8ff"], ["#3a1d21", "#ff9aa0"], ["#3a2f12", "#f5c95c"], ["#24321a", "#b5dc7a"]] },
};
const colors = ["#3665f3", "#e53238", "#f5af02", "#86b817"];
const word = `<span style="color:${colors[0]}">n</span><span style="color:${colors[1]}">e</span><span style="color:${colors[2]}">x</span><span style="color:${colors[3]}">t</span>`;
const base = `*{box-sizing:border-box}body{margin:0;background:transparent;font-family:"Market Sans",Arial,Helvetica,sans-serif}`;

const header = (t) => `<style>${base}
  .wrap{width:880px;padding:36px 0 30px;text-align:center}
  .word{font-size:96px;letter-spacing:-8px;line-height:1;margin-left:-8px}
  h1{margin:18px 0 10px;color:${t.ink};font-size:40px;font-weight:700;letter-spacing:-1.4px}
  p{margin:0;color:${t.muted};font-size:19px}
  .chips{display:flex;justify-content:center;gap:10px;margin-top:24px}
  .chips span{padding:7px 14px;border-radius:999px;font-size:14px;font-weight:700}
</style><div class="wrap"><div class="word">${word}</div><h1>Restocks that never stop.</h1>
<p>Line up every copy you have for an eBay listing. Next puts the next one up each time one sells.</p>
<div class="chips">${["Free and open source", "MIT", "Runs on your Mac", "eBay sellers"].map((label, i) => `<span style="background:${t.tints[i][0]};color:${t.tints[i][1]}">${label}</span>`).join("")}</div></div>`;

const steps = [
  ["Pick the listing", "Paste the item number of something you have more than one of."],
  ["Line up your copies", "Each with its own photos and price, or a stack of the same."],
  ["Set the pace", "Raise the price per copy, wait between sales, or hold for your OK."],
  ["It sells, next goes up", "Same item number, same sold count. Discord tells you."],
];
const cards = (t) => `<style>${base}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;width:880px;padding:4px}
  .card{display:flex;flex-direction:column;gap:8px;min-height:176px;padding:20px 20px 22px;border:1px solid ${t.line};border-radius:18px;background:${t.card}}
  .n{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;font-size:13px;font-weight:800}
  strong{margin-top:6px;color:${t.ink};font-size:17px;letter-spacing:-.3px;line-height:1.2}
  span.d{color:${t.muted};font-size:14px;line-height:1.4}
</style><div class="grid">${steps.map(([title, detail], i) => `<div class="card"><span class="n" style="background:${t.tints[i][0]};color:${t.tints[i][1]}">0${i + 1}</span><strong>${title}</strong><span class="d">${detail}</span></div>`).join("")}</div>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 900, height: 400 }, deviceScaleFactor: 2 });
for (const [name, theme] of Object.entries(themes)) {
  for (const [kind, html, selector] of [["header", header(theme), ".wrap"], ["steps", cards(theme), ".grid"]]) {
    await page.setContent(html);
    await page.locator(selector).screenshot({ path: join(out, `${kind}-${name}.png`), omitBackground: true });
  }
}
await browser.close();

// Short, looping GIF of a sale and the next copy going up.
const gifFilter = "fps=12,scale=820:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle";
await run(ffmpegPath, ["-y", "-loglevel", "error", "-i", join(root, "public/demos/restock.mp4"), "-vf", gifFilter, "-loop", "0", join(out, "restock.gif")]);
console.log("wrote .github/readme");
