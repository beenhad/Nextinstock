// Records the landing page "How it works" loops and the hero still from the real tool UI.
// Usage: npm run build && npm run start (or dev), then `npm run record:demos`.
// Uses the fixture API, so nothing touches eBay. CHROME_PATH overrides the browser.
import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { installFixtureApi, fixtureData } from "./tool-fixture.mjs";

const run = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "public", "demos");
const scratch = await mkdtemp(join(tmpdir(), "nextinstock-capture-"));
const base = process.env.NEXTINSTOCK_CAPTURE_URL ?? "http://127.0.0.1:3000";
const W = 1280, H = 800;
const only = process.argv.slice(2);

const css = `
  html { scrollbar-width: none; } html::-webkit-scrollbar { display: none; }
  nextjs-portal, .tool-sidebar, .tool-topbar, .rl-back, .tool-toast { display: none !important; }
  .tool-shell { display: block !important; background: #f7f7f8 !important; }
  .tool-main { margin: 0 !important; }
  .tool-workspace { max-width: none !important; padding: 26px 34px !important; }
  .cur { position: fixed; z-index: 1000; left: 0; top: 0; width: 20px; height: 24px; pointer-events: none; filter: drop-shadow(0 1px 2px #0005); display: none; }
  .ring { position: fixed; z-index: 999; width: 26px; height: 26px; border: 2px solid #3665f3; border-radius: 50%; opacity: 0; pointer-events: none; transform: translate(-50%, -50%); }
  .ring.p { animation: rp .38s ease-out; } @keyframes rp { from { opacity: .8; scale: .4; } to { opacity: 0; scale: 1.7; } }
`;
const cursorJs = `
  const c = document.createElement('div'); c.className = 'cur';
  c.innerHTML = '<svg viewBox="0 0 24 28"><path d="M2 1v23l5.2-5.7 4.2 8 4-2-4.4-7.5H21Z" fill="white" stroke="#171717" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  const r = document.createElement('div'); r.className = 'ring'; document.body.append(c, r);
  document.addEventListener('pointermove', e => { c.style.display = 'block'; c.style.transform = 'translate3d(' + e.clientX + 'px,' + e.clientY + 'px,0)'; });
  document.addEventListener('pointerdown', e => { r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; r.classList.remove('p'); void r.offsetWidth; r.classList.add('p'); });
`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

// Frames come from a CDP screencast at 2x, not Playwright's recordVideo, which is 1x and heavily compressed.
async function scene(name, { tasks, record = true, width = W, height = H, scale = 2, open = true } = {}, script) {
  if (only.length && !only.includes(name)) return;
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await context.newPage();
  const frames = [];
  let cdp = null;
  page.setDefaultTimeout(6000);
  const controller = {};
  await page.clock.install();
  await installFixtureApi(page, base, { latencyMs: 80, initialTasks: tasks, controller });
  await page.goto(`${base}/tool`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: cursorJs });
  if (open) { await page.locator(".lh-row").first().click(); await page.waitForTimeout(700); }
  let at = { x: width * 0.6, y: height * 0.75 };
  const glide = async (loc) => {
    await loc.scrollIntoViewIfNeeded();
    const box = await loc.boundingBox(); const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    for (let i = 1; i <= 18; i += 1) { const t = i / 18, e = t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2; await page.mouse.move(at.x + (to.x - at.x) * e, at.y + (to.y - at.y) * e); await page.waitForTimeout(10); }
    at = to; await page.waitForTimeout(90);
  };
  const click = async (loc) => {
    await glide(loc);
    // Layout can shift while images load; land on where the target is now.
    const box = await loc.boundingBox(); at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.waitForTimeout(50); await page.mouse.up();
  };
  const type = async (loc, text, delay = 45) => { await click(loc); await loc.pressSequentially(text, { delay }); };
  await page.mouse.move(at.x, at.y);
  if (record) {
    cdp = await context.newCDPSession(page);
    cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => { frames.push({ data, t: metadata.timestamp }); void cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined); });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 94, maxWidth: width * scale, maxHeight: height * scale, everyNthFrame: 1 });
  }
  await page.waitForTimeout(250);
  const mark = Date.now() / 1000;
  try { await script({ page, click, type, glide, controller, wait: (ms) => page.waitForTimeout(ms) }); } catch (error) { await page.screenshot({ path: join(root, "capture-error.png") }); throw error; }
  const end = Date.now() / 1000;
  if (cdp) { await cdp.send("Page.stopScreencast").catch(() => undefined); }
  await context.close();
  if (!record) return;
  // Keep the last frame before the mark as the opening frame, then everything up to the end.
  const firstIndex = Math.max(0, frames.findIndex((frame) => frame.t >= mark) - 1);
  const kept = frames.slice(firstIndex).filter((frame) => frame.t <= end);
  const dir = join(scratch, name); await mkdir(dir, { recursive: true });
  let list = "";
  for (let i = 0; i < kept.length; i += 1) {
    const file = join(dir, `f${String(i).padStart(5, "0")}.jpg`);
    await writeFile(file, Buffer.from(kept[i].data, "base64"));
    const from = Math.max(kept[i].t, mark), to = i + 1 < kept.length ? kept[i + 1].t : end;
    list += `file '${file}'\nduration ${Math.max(0.001, to - from).toFixed(4)}\n`;
  }
  list += `file '${join(dir, `f${String(kept.length - 1).padStart(5, "0")}.jpg`)}'\n`;
  const listFile = join(dir, "list.txt"); await writeFile(listFile, list);
  const input = ["-f", "concat", "-safe", "0", "-i", listFile];
  const vf = "setpts=PTS/1.25,fps=30,scale=1600:-2:flags=lanczos";
  await run(ffmpegPath, ["-y", "-loglevel", "error", ...input, "-an", "-vf", vf, "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-tune", "animation", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(output, `${name}.mp4`)]);
  await run(ffmpegPath, ["-y", "-loglevel", "error", ...input, "-an", "-vf", vf, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "34", "-row-mt", "1", join(output, `${name}.webm`)]);
  await run(ffmpegPath, ["-y", "-loglevel", "error", "-sseof", "-0.1", "-i", join(output, `${name}.mp4`), "-frames:v", "1", "-q:v", "4", join(output, `${name}.jpg`)]);
  console.log("recorded", name);
}

const data = fixtureData(base);
const empty = () => [{ ...structuredClone(data.task), queuedCopies: [], queuedCopy: null }];

// 1 · Pick the listing
await scene("choose", { tasks: [], open: false }, async ({ page, click, type, wait }) => {
  await click(page.getByRole("button", { name: /Add a listing/ }).first()); await wait(350);
  await type(page.getByLabel("eBay item number"), "900000000102", 35);
  await click(page.getByRole("button", { name: /Sync eBay/ })); await page.clock.fastForward(500); await wait(700);
  await click(page.getByRole("button", { name: /Line up copies/ })); await wait(1400);
});

// 2 · Line up your copies: one with its own photos, then a stack of the same
await scene("prepare", { tasks: empty() }, async ({ page, click, type, wait }) => {
  await wait(300);
  await click(page.getByRole("button", { name: /A different copy/ })); await wait(250);
  await page.locator(".rl-drop input[type=file]").setInputFiles(join(root, "public/demos/pokemon-xd-next.webp")); await wait(200);
  await click(page.getByRole("radio", { name: /Good/ }));
  await type(page.locator(".rl-editor .rl-money input").first(), "89.99");
  await type(page.getByPlaceholder(/No manual/), "Disc only, tested", 22);
  await click(page.getByRole("button", { name: /Add to the line/ })); await wait(600);
  await click(page.locator('[data-key="node-add"]')); await wait(250);
  await click(page.getByRole("button", { name: /Another of the same/ })); await wait(400);
  const more = page.getByRole("button", { name: "One more" });
  for (let i = 0; i < 3; i += 1) { await click(more); await wait(150); }
  await wait(1300);
});

// 3 · Set the pace: price steps up, then one copy waits for your OK
await scene("pace", {}, async ({ page, click, type, wait }) => {
  await wait(300);
  await click(page.locator(".rl-node.is-run").first()); await wait(450);
  await type(page.getByLabel("Change per copy"), "5", 80);
  await click(page.getByRole("button", { name: "Apply" })); await wait(500);
  await click(page.getByRole("radio", { name: "After a wait" })); await wait(400);
  await click(page.locator('[data-key="link-copy-2"]')); await wait(350);
  await click(page.getByRole("radio", { name: "When I say so" })); await wait(1300);
});

// 4 · It sells, the next copy goes live on the same listing
await scene("restock", {}, async ({ page, controller, wait }) => {
  await wait(900);
  for (let i = 0; i < 2; i += 1) {
    controller.sell(); await page.clock.fastForward(4100); await wait(1500);
  }
  await wait(600);
});

// Hero still: the release line with a copy open
await scene("hero", { record: false, width: 1040, height: 900, scale: 2 }, async ({ page, wait }) => {
  await page.addStyleTag({ content: ".cur, .ring { display: none !important; } .tool-workspace { padding: 22px 26px !important; }" });
  await page.keyboard.press("Escape"); await wait(400);
  const box = await page.locator(".tool-workspace").boundingBox();
  await page.screenshot({ path: join(scratch, "hero.png"), clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 900) } });
  await run(ffmpegPath, ["-y", "-loglevel", "error", "-i", join(scratch, "hero.png"), "-c:v", "libwebp", "-quality", "88", join(output, "hero-release-line.webp")]);
  console.log("captured hero");
});

await browser.close();
await rm(scratch, { recursive: true, force: true });
