import { chromium } from "playwright";
import ffmpegPath from "ffmpeg-static";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const run = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "public", "demos");
const scratch = await mkdtemp(join(tmpdir(), "nextinstock-capture-"));
const base = process.env.NEXTINSTOCK_CAPTURE_URL ?? "http://127.0.0.1:3000";
const currentPhoto = `${base}/demos/pokemon-xd-current.webp`;
const nextPhoto = `${base}/demos/pokemon-xd-next.webp`;
const now = new Date().toISOString();

const listing = {
  itemId: "900000000102", sku: null, title: "Pokémon XD: Gale of Darkness",
  listingUrl: "", listingType: "FixedPriceItem", listingStatus: "Active", listingDuration: "GTC",
  conditionId: "3000", conditionName: "Good", conditionDescription: "Complete in box. Disc tested.",
  price: 84.99, currency: "USD", quantityTotal: 9, quantitySold: 8, quantityAvailable: 1,
  imageUrls: [currentPhoto], variationCount: 0, variations: [], variationPictureAxis: null,
  outOfStockControl: true, supported: true, unsupportedReasons: [], fetchedAt: now,
};

const queuedCopy = {
  id: "demo-copy", taskId: "demo-task", queuePosition: 1, internalReference: "GC-PKXD-009",
  targetPrice: 84.99, conditionId: "3000", conditionName: "Good",
  conditionDescription: "Complete in box. Disc tested.", status: "queued", createdAt: now,
  photos: [{ id: "demo-photo", copyId: "demo-copy", position: 1, originalName: "pokemon-xd-next.webp",
    mimeType: "image/webp", byteSize: 200000, width: 1600, height: 1600, sha256: "demo", url: nextPhoto,
    ebayImageId: null, ebayImageUrl: null }],
};

const initialTask = {
  id: "demo-task", itemId: listing.itemId, variationKey: null, status: "scheduled",
  listing: { ...listing, quantitySold: 9, quantityAvailable: 0 },
  queuedCopy, queuedCopies: [queuedCopy], armedQuantitySold: 8, lastSeenQuantitySold: 9,
  lastSeenQuantityAvailable: 0, lastCheckedAt: now, lastError: null, createdAt: now, updatedAt: now,
};

const captureCSS = `
  html, body { width: 1600px !important; height: 900px !important; overflow: hidden !important; }
  .tool-shell { display: block !important; width: 800px !important; min-height: 350px !important; background: #fff !important; transform: scale(2); transform-origin: top left; }
  nextjs-portal { display: none !important; }
  .tool-sidebar, .tool-topbar { display: none !important; }
  .tool-main, .tool-workspace { width: 800px !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
  .builder-shell { width: 800px !important; max-width: none !important; }
  .builder-heading, .builder-stepper { display: none !important; }
  .builder-card { display: flex !important; height: 350px !important; flex-direction: column !important; border: 0 !important; border-radius: 0 !important; }
  .builder-content { min-height: 0 !important; height: 350px !important; flex: 1 !important; padding: 22px 28px !important; overflow: hidden !important; }
  .builder-content h2 { font-size: 25px !important; }
  .builder-content > p { margin-bottom: 16px !important; }
  .builder-actions { display: none !important; }
  .builder-copy-grid { gap: 19px !important; }
  .builder-photo-grid, .builder-upload-placeholder { min-height: 150px !important; }
  .builder-photo-grid img { max-height: 150px !important; }
  .builder-upload-area > small { display: none !important; }
  .builder-fields { gap: 7px !important; }
  .builder-fields label { gap: 3px !important; }
  .builder-fields input, .builder-fields textarea { min-height: 34px !important; padding: 6px 9px !important; }
  .builder-fields textarea { height: 41px !important; }
  .builder-fields label:nth-child(2), .builder-fields label small, .builder-verified { display: none !important; }
  .tool-page-heading, .tool-stat-row, .tool-task-head { display: none !important; }
  .tool-task-table-section { margin: 0 !important; border: 0 !important; border-radius: 0 !important; }
  .tool-task-table, .tool-task-entry, .tool-task-row { width: 800px !important; min-width: 0 !important; }
  .tool-task-row { grid-template-columns: minmax(0, 1.25fr) minmax(0, .75fr) minmax(0, .75fr) !important; grid-template-rows: auto auto !important; gap: 10px 14px !important; min-height: 180px !important; }
  .tool-listing-cell, .tool-copy-cell { min-width: 0 !important; }
  .tool-task-row > .tool-copy-cell:nth-child(2) { display: flex !important; }
  .tool-task-row > .tool-task-status { grid-column: 1 !important; grid-row: 2 !important; }
  .tool-task-actions { grid-column: 2 / 4 !important; grid-row: 2 !important; justify-self: end !important; }
  .tool-task-actions button:first-child, .tool-queue-details { display: none !important; }
  .tool-listing-cell strong { font-size: 13px !important; }
  .tool-toast { left: 50% !important; bottom: 16px !important; transform: translateX(-50%) !important; }
  .capture-cursor { position: fixed; z-index: 1000; top: 0; left: 0; display: none; width: 44px; height: 52px; pointer-events: none; filter: drop-shadow(0 1px 2px #0006); }
  .capture-cursor svg { width: 100%; height: 100%; }
  .capture-click { position: fixed; z-index: 999; width: 40px; height: 40px; border: 3px solid #3665f3; border-radius: 50%; opacity: 0; pointer-events: none; transform: translate(-50%, -50%); }
  .capture-click.pulse { animation: capture-pulse 350ms ease-out; }
  @keyframes capture-pulse { from { opacity: .8; scale: .5; } to { opacity: 0; scale: 1.8; } }
`;

const cursorScript = `
  const cursor = document.createElement('div'); cursor.className = 'capture-cursor';
  cursor.innerHTML = '<svg viewBox="0 0 24 28" xmlns="http://www.w3.org/2000/svg"><path d="M2 1v23l5.2-5.7 4.2 8 4-2-4.4-7.5H21Z" fill="white" stroke="#171717" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  const ring = document.createElement('div'); ring.className = 'capture-click';
  document.body.append(cursor, ring);
  document.addEventListener('pointermove', event => { cursor.style.display = 'block'; cursor.style.transform = 'translate3d('+event.clientX+'px,'+event.clientY+'px,0)'; });
  document.addEventListener('pointerdown', event => { ring.style.left=event.clientX+'px'; ring.style.top=event.clientY+'px'; ring.classList.remove('pulse'); void ring.offsetWidth; ring.classList.add('pulse'); });
`;

function fixtureRoutes(page, scene) {
  let task = scene === "restock" ? structuredClone(initialTask) : null;
  const json = (route, data) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  return page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/tasks" && request.method() === "GET") return json(route, { tasks: task ? [task] : [] });
    if (path === "/api/activity") return json(route, { events: [] });
    if (path === "/api/system/status") return json(route, { status: {
      ebayConfigured: true, ebayCredentialSource: "nextinstock", writeMode: "dry-run", storageDriver: "local",
      storagePath: "", persistentStorage: true, pollSeconds: 30, restockDelaySeconds: 60,
      defaultItemId: "", liveWritesAuthorized: false, liveWritesBlocker: null, discordConnected: false,
    } });
    if (path === "/api/ebay/profile") return json(route, { profile: { userId: "Demo seller", avatarUrl: null, profileUrl: "" } });
    if (path === "/api/ebay/listings") { await new Promise((resolve) => setTimeout(resolve, 400)); return json(route, { listing }); }
    if (path === "/api/tasks/demo-task/check") {
      await new Promise((resolve) => setTimeout(resolve, 750));
      task = { ...task, status: "active", listing: { ...task.listing, quantityAvailable: 1, quantitySold: 9,
        imageUrls: [nextPhoto] }, queuedCopy: null, queuedCopies: [], lastSeenQuantityAvailable: 1 };
      return json(route, { result: { message: "Next copy is live on the same listing" } });
    }
    throw new Error(`Recording blocked unexpected API request: ${request.method()} ${path}`);
  });
}

async function pointAndClick(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Recording target is not visible");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 28 });
  await page.waitForTimeout(320);
  await page.mouse.click(x, y);
}

async function prepareBuilder(page) {
  await pointAndClick(page, page.getByRole("button", { name: /New restock task/ }));
  const input = page.getByRole("textbox", { name: "eBay item number" });
  await input.fill(listing.itemId);
  await pointAndClick(page, page.getByRole("button", { name: /Sync eBay/ }));
  await page.locator(".builder-listing-selected img").waitFor({ state: "attached" });
  await page.waitForFunction(() => [...document.images].filter((image) => image.src.includes('pokemon-xd-current')).every((image) => image.complete && image.naturalWidth > 0));
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });

try {
  for (const scene of (process.env.CAPTURE_SCENES?.split(",") ?? ["choose", "prepare", "restock"])) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1,
      recordVideo: { dir: scratch, size: { width: 1600, height: 900 } } });
    const page = await context.newPage();
    const videoStart = Date.now();
    await fixtureRoutes(page, scene);
    await page.goto(`${base}/tool`, { waitUntil: "networkidle" });

    if (scene === "choose") {
      await pointAndClick(page, page.getByRole("button", { name: /New restock task/ }));
    } else if (scene === "prepare") {
      await prepareBuilder(page);
      await page.getByRole("button", { name: /Continue/ }).click();
    }
    await page.addStyleTag({ content: captureCSS });
    await page.addScriptTag({ content: cursorScript });
    await page.waitForTimeout(850);
    if (process.env.CAPTURE_DEBUG) {
      console.log(scene, (await page.locator("body").innerText()).slice(-1200));
      if (scene === "restock") console.log("restock geometry", await page.locator(".tool-task-row").evaluate((node) => ({ columns: getComputedStyle(node).gridTemplateColumns, width: node.getBoundingClientRect().width })), await page.getByRole("button", { name: /Check eBay/ }).boundingBox());
    }
    const clipStart = (Date.now() - videoStart) / 1000;

    if (scene === "choose") {
      const input = page.getByRole("textbox", { name: "eBay item number" });
      await pointAndClick(page, input);
      await input.pressSequentially(listing.itemId, { delay: 95 });
      await page.waitForTimeout(650);
      await pointAndClick(page, page.getByRole("button", { name: /Sync eBay/ }));
      await page.locator(".builder-listing-selected img").waitFor();
      await page.waitForTimeout(2800);
    } else if (scene === "prepare") {
      await pointAndClick(page, page.locator(".builder-file-button"));
      await page.locator(".builder-file-button input").setInputFiles(join(output, "pokemon-xd-next.webp"));
      await page.waitForTimeout(850);
      const reference = page.getByRole("textbox", { name: "Internal reference" });
      await pointAndClick(page, reference);
      await reference.pressSequentially("GC-PKXD-009", { delay: 90 });
      await page.waitForTimeout(450);
      const note = page.getByRole("textbox", { name: /Condition note/ });
      await pointAndClick(page, note);
      await note.fill("");
      await note.pressSequentially("Complete in box. Disc tested.", { delay: 55 });
      await page.waitForTimeout(450);
      const price = page.getByRole("spinbutton", { name: /Price when this copy restocks/ });
      await pointAndClick(page, price);
      await price.pressSequentially("84.99", { delay: 105 });
      await page.waitForTimeout(2200);
    } else {
      await page.waitForTimeout(1600);
      await pointAndClick(page, page.getByRole("button", { name: /Check eBay/ }));
      await page.waitForTimeout(5500);
      if (process.env.CAPTURE_DEBUG) console.log("after check", (await page.locator("body").innerText()).slice(-850));
    }

    await page.screenshot({ path: join(output, `${scene}.jpg`), type: "jpeg", quality: 90,
      clip: { x: 0, y: 0, width: 1600, height: 700 } });
    const clipEnd = (Date.now() - videoStart) / 1000;
    const recordedVideo = page.video();
    await context.close();
    const inputPath = await recordedVideo.path();
    const start = Math.max(0, clipStart - 0.18).toFixed(2);
    const duration = (clipEnd - clipStart + 0.18).toFixed(2);
    const webm = join(output, `${scene}.webm`);
    const mp4 = join(output, `${scene}.mp4`);
    if (!ffmpegPath) { await copyFile(inputPath, webm); throw new Error("ffmpeg-static is required to trim the clips"); }
    await run(ffmpegPath, ["-y", "-i", inputPath, "-ss", start, "-t", duration, "-vf", "crop=1600:700:0:0", "-an", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "24", webm]);
    await run(ffmpegPath, ["-y", "-i", inputPath, "-ss", start, "-t", duration, "-vf", "crop=1600:700:0:0", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
    console.log(`${scene}: ${duration}s from real UI with fixture API`);
  }
} finally {
  await browser.close();
  await rm(scratch, { recursive: true, force: true });
}
