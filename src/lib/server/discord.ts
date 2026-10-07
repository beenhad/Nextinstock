import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { discordWebhookUrl, restockDelaySeconds } from "./config";
import { pendingDiscordNotifications, queueDiscordNotification, recordDiscordDelivery } from "./database";
import type { ListingSnapshot, RestockPlan, WorkerResult } from "@/lib/types";

type DiscordEmbed = {
  title: string;
  description?: string;
  color: number;
  timestamp: string;
  url?: string;
  thumbnail?: { url: string };
  fields?: Array<{ name: string; value: string; inline: boolean }>;
  footer?: { text: string };
};

export type DiscordWebhookPayload = Record<string, unknown> & {
  username?: string;
  content?: string;
  embeds?: DiscordEmbed[];
};

const COLORS = {
  test: 0x3155f5,
  restock_scheduled: 0x2ea66f,
  restocking: 0x3155f5,
  dry_run_ready: 0x3155f5,
  held_at_zero: 0xe6a23c,
  awaiting_approval: 0xe6a23c,
  skipped: 0xe6a23c,
  restocked: 0x2ea66f,
  failed: 0xdc5252,
} as const;

export function validateDiscordWebhookUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || url.hostname !== "discord.com" ||
      !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9._-]+\/?$/.test(url.pathname) ||
      url.search || url.hash) {
    throw new Error("Paste a Discord webhook URL from Server Settings → Integrations.");
  }
  return url.toString();
}

function safeListingUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "ebay.com" || url.hostname.endsWith(".ebay.com"))
      ? url.toString() : undefined;
  } catch { return undefined; }
}

function safeProductImage(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "ebayimg.com" || url.hostname.endsWith(".ebayimg.com"))
      ? url.toString() : undefined;
  } catch { return undefined; }
}

function shortProductTitle(value: string): string {
  const title = value.replace(/[\r\n]+/g, " ").replace(/[\[\]()*_~`>|]/g, "").trim();
  return title.length > 46 ? title.slice(0, 45).trimEnd() + "…" : title;
}

function shortPlainText(value: string, length = 70): string {
  const text = value.replace(/[\r\n]+/g, " ").replace(/[*_~`>|]/g, "").trim();
  return text.length > length ? text.slice(0, length - 1).trimEnd() + "…" : text;
}

function restockAction(result: WorkerResult): string {
  const plan = result.plan;
  const copy = plan?.copy;
  const price = copy?.targetPrice == null
    ? ""
    : ` · price ${new Intl.NumberFormat("en-US", { style: "currency", currency: result.listing.currency }).format(copy.targetPrice)}`;
  const work = copy
    ? plan?.variationKey
      ? `${shortPlainText(copy.internalReference, 36)} · selected option 0 → 1${price}; photos and condition unchanged.`
      : `${shortPlainText(copy.internalReference, 36)} · ${copy.photoCount} photos + condition${price} → verify at 0 → publish 1.`
    : "";
  if (result.action === "held_at_zero") {
    return copy
      ? "Queued copy needs work. Listing stays at 0 until it is ready."
      : "No next copy queued · listing stays at 0. Add a copy to resume.";
  }
  if (result.action === "awaiting_approval") {
    const base = (process.env.NEXTINSTOCK_PUBLIC_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
    return `Next copy is ready${work ? `: ${work}` : "."}\n[Approve the restock](${base}/tool?approve=${encodeURIComponent(result.taskId)}) · opens Next on your computer`;
  }
  if (result.action === "dry_run_ready") {
    return `Live writes off · listing stays at 0.${work ? `\nPrepared: ${work}` : ""}`;
  }
  if (result.action === "restocking") {
    return `Applying queued copy while listing stays at 0.${work ? `\n${work}` : ""}`;
  }
  if (result.action === "restocked") {
    if (result.remainingQueuedCopies === 0) return "One unit is live. No other copies are queued for the next sale.";
    if (result.remainingQueuedCopies !== undefined) return `One unit is live. ${result.remainingQueuedCopies} ${result.remainingQueuedCopies === 1 ? "copy" : "copies"} queued for the next sale.`;
    return "One unit is live. Check the next copy in Next.";
  }
  if (result.action === "failed") {
    return `Review Activity. ${shortPlainText(result.message, 95)}`;
  }
  if (result.action === "skipped") {
    return `Review task before restocking. ${shortPlainText(result.message, 90)}`;
  }
  if (result.action !== "restock_scheduled" || !result.scheduledFor || !copy) {
    return "Review the restock task in Next.";
  }
  const eligibleAt = Math.floor(Date.parse(result.scheduledFor) / 1000);
  return `Awaiting restock · eligible <t:${eligibleAt}:R> (next worker check)\n${work}`;
}

function productEmbed(listing: ListingSnapshot, options: {
  title: string;
  color: number;
  at: Date;
  variationKey?: string | null;
  sold?: number;
  available?: number;
  soldLabel?: string;
  availableLabel?: string;
  nextAction?: string;
  footer?: string;
}): DiscordEmbed {
  const variation = listing.variations.find((item) => item.key === options.variationKey);
  const image = variation?.imageUrls.map(safeProductImage).find(Boolean) ?? listing.imageUrls.map(safeProductImage).find(Boolean);
  const footer = options.footer ?? "eBay " + listing.itemId + (variation ? " · " + variation.label.slice(0, 45) : "");
  const listingUrl = safeListingUrl(listing.listingUrl);
  const productTitle = shortProductTitle(listing.title);
  const embed: DiscordEmbed = {
    title: options.title,
    description: listingUrl ? `[${productTitle}](${listingUrl})` : productTitle,
    color: options.color,
    timestamp: options.at.toISOString(),
    footer: { text: footer },
  };
  if (image) embed.thumbnail = { url: image };
  if (options.sold !== undefined && options.available !== undefined) {
    embed.fields = [
      { name: "SOLD", value: options.soldLabel ?? String(options.sold), inline: false },
      { name: "AVAILABLE", value: options.availableLabel ?? String(options.available), inline: false },
    ];
  }
  if (options.nextAction) {
    embed.fields ??= [];
    embed.fields.push({ name: "NEXT ACTION", value: options.nextAction, inline: false });
  }
  return embed;
}

export function buildTestDiscordPayload(at = new Date()): DiscordWebhookPayload {
  return {
    username: "Next",
    embeds: [{
      title: "🔔 Connection test",
      description: "Discord alerts are connected. No eBay listing was checked or changed.",
      color: COLORS.test,
      timestamp: at.toISOString(),
      footer: { text: "Next · Test" },
    }],
  };
}

export function buildPreviewDiscordPayload(listing: ListingSnapshot, at = new Date()): DiscordWebhookPayload {
  const sold = listing.quantitySold + 1;
  const atZero: ListingSnapshot = { ...listing, quantitySold: sold, quantityAvailable: 0, variations: [] };
  const plan: RestockPlan = {
    taskId: "preview", itemId: listing.itemId, variationKey: null, writeMode: "live",
    trigger: { armedQuantitySold: sold, currentQuantitySold: sold, currentQuantityAvailable: 0 },
    copy: { id: "preview-copy", internalReference: "EXAMPLE-COPY", conditionId: listing.conditionId, conditionDescription: "Example condition", photoCount: 5, targetPrice: null },
    mutation: { uploadLocalPhotosToEps: true, replaceAllPictureUrls: true, reviseConditionDescription: true, revisePrice: false, verifyWhileAtZero: true, restoreAvailableQuantityTo: 1 },
    blockers: [],
  };
  const base: WorkerResult = { taskId: "preview", action: "restock_scheduled", message: "Simulated alert", listing: atZero, plan };
  const results: WorkerResult[] = [
    { ...base, trigger: { kind: "new_sale", previousSold: listing.quantitySold, previousAvailable: listing.quantityAvailable }, scheduledFor: new Date(at.getTime() + restockDelaySeconds() * 1000).toISOString() },
    { ...base, trigger: { kind: "already_at_zero", previousSold: sold, previousAvailable: 0 }, scheduledFor: new Date(at.getTime() + restockDelaySeconds() * 1000).toISOString() },
    { ...base, action: "restocking" },
    { ...base, action: "restocked", listing: { ...atZero, quantityAvailable: 1 }, remainingQueuedCopies: 1 },
    { ...base, action: "restocked", listing: { ...atZero, quantityAvailable: 1 }, remainingQueuedCopies: 0 },
    { ...base, action: "held_at_zero", plan: { ...plan, copy: null } },
    { ...base, action: "dry_run_ready" },
    { ...base, action: "failed", message: "eBay did not confirm the queued revision" },
    { ...base, action: "skipped", message: "Listing changed outside Next" },
  ];
  const embeds = results.map((result, index) => {
    const embed = buildWorkerDiscordPayload(result, at)?.embeds?.[0];
    if (!embed) throw new Error("Could not build a Discord alert preview");
    return { ...embed, footer: { text: `PREVIEW ${index + 1}/${results.length} · Trigger ${sold} sold · Simulated · No eBay change` } };
  });
  return { username: "Next", embeds };
}

export function buildWorkerDiscordPayload(result: WorkerResult, at = new Date()): DiscordWebhookPayload | null {
  const statuses: Partial<Record<WorkerResult["action"], { title: string }>> = {
    restock_scheduled: { title: result.trigger?.kind === "new_sale" ? "🟢 NEW SALE" : "🟢 AWAITING RESTOCK" },
    restocking: { title: "🔵 RESTOCKING" },
    dry_run_ready: { title: "🔵 RESTOCK READY · DRY RUN" },
    held_at_zero: { title: "🟠 RESTOCK ON HOLD" },
    awaiting_approval: { title: "🟡 SOLD · WAITING FOR YOUR OK" },
    skipped: { title: "🟠 RESTOCK NEEDS REVIEW" },
    restocked: { title: "🟢 RESTOCKED" },
    failed: { title: "🔴 RESTOCK NEEDS ATTENTION" },
  };
  const status = statuses[result.action];
  if (!status) return null;
  const variation = result.listing.variations.find((item) => item.key === result.plan?.variationKey);
  const color = COLORS[result.action as keyof typeof COLORS];
  const trigger = result.plan?.trigger;
  const footer = trigger
    ? `eBay ${result.listing.itemId} · Trigger ${trigger.armedQuantitySold ?? trigger.currentQuantitySold} sold / 0 available${variation ? ` · ${variation.label.slice(0, 30)}` : ""}`
    : `eBay ${result.listing.itemId}`;
  const showChange = result.trigger?.kind === "new_sale" && ["restock_scheduled", "dry_run_ready", "held_at_zero"].includes(result.action);
  return {
    username: "Next",
    embeds: [productEmbed(result.listing, {
      ...status,
      color,
      at,
      variationKey: result.plan?.variationKey,
      sold: variation?.quantitySold ?? result.listing.quantitySold,
      available: variation?.quantityAvailable ?? result.listing.quantityAvailable,
      soldLabel: showChange ? `${result.trigger!.previousSold} → ${trigger?.currentQuantitySold}` : undefined,
      availableLabel: showChange ? `${result.trigger!.previousAvailable} → 0` : undefined,
      nextAction: restockAction(result),
      footer,
    })],
  };
}

export async function configureDiscordWebhook(webhookUrl: string): Promise<void> {
  const url = validateDiscordWebhookUrl(webhookUrl);
  const avatar = readFileSync(path.join(process.cwd(), "assets", "nextinstock-webhook-avatar.png"));
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Next", avatar: "data:image/png;base64," + avatar.toString("base64") }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Discord could not set the webhook avatar (HTTP " + response.status + ").");
}

export async function sendDiscordMessage(webhookUrl: string, payload: DiscordWebhookPayload): Promise<void> {
  const url = validateDiscordWebhookUrl(webhookUrl);
  const response = await fetch(url + "?wait=true", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Discord returned HTTP " + response.status);
}

export function queueWorkerDiscordUpdate(result: WorkerResult) {
  if (!discordWebhookUrl()) return;
  const payload = buildWorkerDiscordPayload(result);
  if (!payload) return;
  const sold = result.plan?.trigger.currentQuantitySold ?? result.listing.quantitySold;
  const reason = ["failed", "skipped"].includes(result.action)
    ? ":" + createHash("sha256").update(result.message).digest("hex").slice(0, 12)
    : "";
  const key = result.taskId + ":" + sold + ":" + result.action + (result.scheduledFor ? ":" + result.scheduledFor : "") + reason;
  queueDiscordNotification(key, payload);
}

export async function flushDiscordNotifications() {
  const url = discordWebhookUrl();
  if (!url) return;
  for (const notification of pendingDiscordNotifications()) {
    try {
      await sendDiscordMessage(url, notification.payload);
      recordDiscordDelivery(notification.eventKey, null);
    } catch (error) {
      recordDiscordDelivery(notification.eventKey, error instanceof Error ? error.message : "Delivery failed");
      break;
    }
  }
}
