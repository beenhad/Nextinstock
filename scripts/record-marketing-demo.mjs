// Records the landing-page demo clips from the real /tool UI against fixture API data.
// Usage: npm run dev, then `npm run record:demos` (CHROME_PATH overrides the browser).
import { chromium } from "playwright";
import ffmpegPath from "ffmpeg-static";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { installFixtureApi } from "./tool-fixture.mjs";

const run = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "public", "demos");
const scratch = await mkdtemp(join(tmpdir(), "nextinstock-capture-"));
const base = process.env.NEXTINSTOCK_CAPTURE_URL ?? "http://127.0.0.1:3000";
const WIDTH = 1600;
const HEIGHT = 1000;
const ZOOM = 1.6; // renders a 1000x625 CSS-pixel layout at 1600x1000 so text stays crisp

const captureCSS = `
  html { zoom: ${ZOOM}; scrollbar-width: none; }
  html::-webkit-scrollbar { display: none; }
  nextjs-portal, .tool-sidebar, .tool-topbar { display: none !important; }
  .tool-shell { display: block !important; min-height: ${HEIGHT / ZOOM}px !important; background: #f7f7f8 !important; }
  .tool-main { margin: 0 !important; }
  .tool-workspace { max-width: none !important; padding: 28px 36px !important; }
  .tool-toast { position: fixed !important; right: 24px !important; bottom: 24px !important; }
  .capture-cursor { position: fixed; z-index: 1000; top: 0; left: 0; display: none; width: 22px; height: 26px; pointer-events: none; filter: drop-shadow(0 1px 2px #0005); }
  .capture-cursor svg { width: 100%; height: 100%; }
  .capture-click { position: fixed; z-index: 999; width: 26px; height: 26px; border: 2px solid #3665f3; border-radius: 50%; opacity: 0; pointer-events: none; transform: translate(-50%, -50%); }
  .capture-click.pulse { animation: capture-pulse 380ms ease-out; }
  @keyframes capture-pulse { from { opacity: .8; scale: .4; } to { opacity: 0; scale: 1.7; } }
`;
const sceneCSS = {
  choose: "",
  prepare: ".builder-heading { display: none !important; }",
  restock: `.tool-page-heading, .tool-stat-row, .tool-table-toolbar { display: none !important; }
    .tool-task-table-section { margin-top: 0 !important; }
    .tool-task-head, .tool-task-row { grid-template-columns: minmax(0, 1.5fr) minmax(0, .9fr) 104px 132px !important; }
    .tool-task-head > span:nth-child(2), .tool-task-row > .tool-copy-cell:nth-child(2) { display: none !important; }
    .tool-workspace { padding-top: 64px !important; }`,
};

const cursorScript = `
  const cursor = document.createElement('div'); cursor.className = 'capture-cursor';
  cursor.innerHTML = '<svg viewBox="0 0 24 28" xmlns="http://www.w3.org/2000/svg"><path d="M2 1v23l5.2-5.7 4.2 8 4-2-4.4-7.5H21Z" fill="white" stroke="#171717" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  const ring = document.createElement('div'); ring.className = 'capture-click';
  document.body.append(cursor, ring);
  document.addEventListener('pointermove', event => { cursor.style.display = 'block'; cursor.style.transform = 'translate3d('+event.clientX+'px,'+event.clientY+'px,0)'; });
  document.addEventListener('pointerdown', event => { ring.style.left=event.clientX+'px'; ring.style.top=event.clientY+'px'; ring.classList.remove('pulse'); void ring.offsetWidth; ring.classList.add('pulse'); });
`;

let pointer = { x: WIDTH * 0.62, y: HEIGHT * 0.7 };
async function glideTo(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Recording target is not visible");
  const target = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const steps = 34;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    await page.mouse.move(pointer.x + (target.x - pointer.x) * ease, pointer.y + (target.y - pointer.y) * ease);
    await page.waitForTimeout(12);
  }
  pointer = target;
  await page.waitForTimeout(160);
}
async function click(page, locator) { await glideTo(page, locator); await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up(); }

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });

try {
  for (const scene of (process.env.CAPTURE_SCENES?.split(",") ?? ["choose", "prepare", "restock"])) {
    const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1,
      recordVideo: { dir: scratch, size: { width: WIDTH, height: HEIGHT } } });
    const page = await context.newPage();
    const videoStart = Date.now();
    await installFixtureApi(page, base, { latencyMs: 180, initialTasks: scene === "restock" ? undefined : [] });
    await page.goto(`${base}/tool`, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: captureCSS + sceneCSS[scene] });
    await page.addScriptTag({ content: cursorScript });
    pointer = { x: WIDTH * 0.62, y: HEIGHT * 0.7 };

    if (scene === "choose" || scene === "prepare") {
      await page.getByRole("button", { name: /New restock task/ }).click();
    }
    if (scene === "prepare") {
      await page.getByRole("textbox", { name: "eBay item number" }).fill("900000000102");
      await page.getByRole("button", { name: /Sync eBay/ }).click();
      await page.locator(".builder-listing-selected img").waitFor();
      await page.getByRole("button", { name: /Continue/ }).click();
      await page.getByRole("textbox", { name: /Condition note/ }).fill("");
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(pointer.x, pointer.y);
    await page.waitForTimeout(700);
    const clipStart = (Date.now() - videoStart) / 1000;

    if (scene === "choose") {
      const input = page.getByRole("textbox", { name: "eBay item number" });
      await click(page, input);
      await input.pressSequentially("900000000102", { delay: 70 });
      await page.waitForTimeout(300);
      await click(page, page.getByRole("button", { name: /Sync eBay/ }));
      await page.locator(".builder-listing-selected img").waitFor();
      await page.waitForTimeout(400);
      await glideTo(page, page.getByRole("button", { name: /Continue/ }));
      await page.waitForTimeout(1600);
    } else if (scene === "prepare") {
      await click(page, page.locator(".builder-file-button"));
      await page.locator(".builder-file-button input").setInputFiles(join(output, "pokemon-xd-next.webp"));
      await page.waitForTimeout(600);
      const reference = page.getByRole("textbox", { name: "Internal reference" });
      await click(page, reference);
      await reference.pressSequentially("GC-PKXD-009", { delay: 65 });
      const note = page.getByRole("textbox", { name: /Condition note/ });
      await click(page, note);
      await note.pressSequentially("Complete in box. Disc tested.", { delay: 40 });
      const price = page.getByRole("spinbutton", { name: /Price when this copy restocks/ });
      await click(page, price);
      await price.pressSequentially("84.99", { delay: 80 });
      await page.waitForTimeout(1500);
    } else {
      await page.waitForTimeout(500);
      const second = page.locator(".tool-price-field input").nth(1);
      await click(page, second);
      await page.keyboard.press("ControlOrMeta+a");
      await second.pressSequentially("82.50", { delay: 80 });
      await page.keyboard.press("Enter");
      await page.waitForTimeout(700);
      await click(page, page.getByRole("button", { name: "Move GC-PKXD-011 earlier" }));
      await page.waitForTimeout(900);
      await click(page, page.getByRole("button", { name: /Check eBay/ }));
      await page.waitForTimeout(3600);
    }

    await page.screenshot({ path: join(output, `${scene}.jpg`), type: "jpeg", quality: 88 });
    const clipEnd = (Date.now() - videoStart) / 1000;
    const recordedVideo = page.video();
    await context.close();
    const inputPath = await recordedVideo.path();
    const start = Math.max(0, clipStart - 0.15).toFixed(2);
    const duration = (clipEnd - clipStart + 0.15).toFixed(2);
    const webm = join(output, `${scene}.webm`);
    const mp4 = join(output, `${scene}.mp4`);
    if (!ffmpegPath) throw new Error("ffmpeg-static is required to trim the clips");
    await run(ffmpegPath, ["-y", "-i", inputPath, "-ss", start, "-t", duration, "-an", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "30", "-row-mt", "1", webm]);
    await run(ffmpegPath, ["-y", "-i", inputPath, "-ss", start, "-t", duration, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
    console.log(`${scene}: ${duration}s`);
  }
} finally {
  await browser.close();
  await rm(scratch, { recursive: true, force: true });
}
