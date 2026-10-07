// Records the landing page "Get the alert" clip: three real Next alerts arriving in a Discord-style channel.
// Usage: node scripts/record-discord-demo.mjs   (no server needed)
import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "public", "demos");
const scratch = await mkdtemp(join(tmpdir(), "nextinstock-discord-"));
const { stdout } = await run("npx", ["tsx", join(root, "scripts/discord-demo-payloads.ts")], { cwd: root });
const embeds = JSON.parse(stdout.trim().split("\n").pop());

const avatar = pathToFileURL(join(root, "assets/nextinstock-webhook-avatar.png")).href;
const thumb = pathToFileURL(join(root, "public/demos/pokemon-xd-current.webp")).href;
const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rich = (text) => esc(text)
  .replace(/&lt;t:\d+:R&gt;/g, '<span class="ts">in 1 minute</span>')
  .replace(/\*\*\[([^\]]+)\]\([^)]+\)\*\*/g, '<a><b>$1</b></a>');
const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;
const time = "Today at 7:26 PM";

const message = (embed, index) => `<div class="msg" style="animation-delay:${0.25 + index * 1.45}s">
  <img class="av" src="${avatar}">
  <div class="body">
    <div class="head"><b>Next</b><span class="app">APP</span><span class="time">${time}</span></div>
    <div class="embed" style="border-color:${hex(embed.color)}">
      <div class="main">
        <div class="author">${esc(embed.author.name)}</div>
        <div class="title">${esc(embed.title)}</div>
        ${embed.description ? `<div class="desc">${rich(embed.description)}</div>` : ""}
        <div class="fields">${(embed.fields ?? []).map((f) => `<div><b>${esc(f.name)}</b><span>${esc(f.value)}</span></div>`).join("")}</div>
        <div class="foot">${esc(embed.footer.text)} • ${time}</div>
      </div>
      <img class="thumb" src="${thumb}">
    </div>
  </div>
</div>`;

const html = `<html><head><style>
  * { box-sizing: border-box; }
  body { margin: 0; width: 640px; height: 600px; overflow: hidden; background: #313338; color: #dbdee1; font-family: "Instrument Sans", "Noto Sans", Arial, sans-serif; font-size: 15px; }
  .channel { display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 18px; border-bottom: 1px solid #26282c; color: #f2f3f5; font-weight: 700; }
  .channel i { color: #80848e; font-style: normal; font-size: 22px; font-weight: 400; }
  .list { display: flex; flex-direction: column; justify-content: flex-start; gap: 14px; padding: 16px 16px 0 14px; }
  .msg { display: flex; gap: 14px; opacity: 0; transform: translateY(10px); }
  .go .msg { animation: in .35s cubic-bezier(.2,.8,.2,1) forwards; }
  @keyframes in { to { opacity: 1; transform: none; } }
  .av { width: 40px; height: 40px; flex: none; border-radius: 50%; background: #fff; }
  .body { min-width: 0; flex: 1; }
  .head { display: flex; align-items: center; gap: 6px; }
  .head b { color: #f2f3f5; font-size: 15px; }
  .app { padding: 1px 5px; border-radius: 4px; background: #5865f2; color: #fff; font-size: 10px; font-weight: 700; }
  .time { margin-left: 2px; color: #949ba4; font-size: 12px; }
  .embed { display: flex; gap: 14px; max-width: 520px; margin-top: 5px; padding: 10px 14px 12px 12px; border-left: 4px solid; border-radius: 4px; background: #2b2d31; }
  .main { min-width: 0; flex: 1; }
  .author { color: #f2f3f5; font-size: 13px; font-weight: 700; }
  .title { margin-top: 6px; overflow: hidden; color: #00a8fc; font-weight: 700; white-space: nowrap; text-overflow: ellipsis; }
  .desc { margin-top: 6px; font-size: 14px; line-height: 1.35; }
  .desc a { color: #00a8fc; }
  .ts { padding: 0 3px; border-radius: 3px; background: #3f4248; }
  .fields { display: flex; gap: 22px; margin-top: 8px; font-size: 14px; }
  .fields div { display: grid; gap: 2px; }
  .fields b { color: #f2f3f5; font-size: 13px; }
  .foot { margin-top: 9px; color: #949ba4; font-size: 12px; }
  .thumb { width: 72px; height: 72px; flex: none; border-radius: 4px; object-fit: cover; background: #fff; }
</style></head><body><div class="channel"><i>#</i>restock-updates</div><div class="list">${embeds.map(message).join("")}</div></body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 640, height: 600 }, deviceScaleFactor: 2 });
const htmlFile = join(scratch, "discord.html");
await writeFile(htmlFile, html);
await page.goto(pathToFileURL(htmlFile).href);
await page.waitForTimeout(400);

const frames = [];
const cdp = await page.context().newCDPSession(page);
cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => { frames.push({ data, t: metadata.timestamp }); void cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined); });
await cdp.send("Page.startScreencast", { format: "png", maxWidth: 1280, maxHeight: 1200, everyNthFrame: 1 });
await page.waitForTimeout(150);
const mark = Date.now() / 1000;
await page.evaluate(() => document.body.classList.add("go"));
await page.waitForTimeout(5600);
const end = Date.now() / 1000;
await cdp.send("Page.stopScreencast");
await browser.close();

const firstIndex = Math.max(0, frames.findIndex((frame) => frame.t >= mark) - 1);
const kept = frames.slice(firstIndex).filter((frame) => frame.t <= end);
let list = "";
for (let i = 0; i < kept.length; i += 1) {
  const file = join(scratch, `f${String(i).padStart(5, "0")}.png`);
  await writeFile(file, Buffer.from(kept[i].data, "base64"));
  const from = Math.max(kept[i].t, mark), to = i + 1 < kept.length ? kept[i + 1].t : end;
  list += `file '${file}'\nduration ${Math.max(0.001, to - from).toFixed(4)}\n`;
}
list += `file '${join(scratch, `f${String(kept.length - 1).padStart(5, "0")}.png`)}'\n`;
await writeFile(join(scratch, "list.txt"), list);
const input = ["-f", "concat", "-safe", "0", "-i", join(scratch, "list.txt")];
const vf = "fps=30,scale=1280:-2:flags=lanczos";
await run(ffmpegPath, ["-y", "-loglevel", "error", ...input, "-an", "-vf", vf, "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-tune", "animation", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(output, "discord.mp4")]);
await run(ffmpegPath, ["-y", "-loglevel", "error", "-sseof", "-0.1", "-i", join(output, "discord.mp4"), "-frames:v", "1", "-q:v", "3", join(output, "discord.jpg")]);
await rm(scratch, { recursive: true, force: true });
console.log("recorded discord");
