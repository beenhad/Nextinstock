import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { discordAlerts, discordWebhookUrl, publicAppUrl, restockDelaySeconds } from "./config";
import { pendingDiscordNotifications, queueDiscordNotification, recordDiscordDelivery } from "./database";
import type { ListingSnapshot, RestockPlan, WorkerResult } from "@/lib/types";

type DiscordEmbed = {
  author?: { name: string };
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

const money = (value: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);

/** One plain sentence: what happens next. */
function restockAction(result: WorkerResult): string {
  const copy = result.plan?.copy;
  const remaining = result.remainingQueuedCopies;
  switch (result.action) {
    case "restock_scheduled":
      if (!result.scheduledFor || !copy) return "Open Next to check the next copy.";
      return `Next copy goes up <t:${Math.floor(Date.parse(result.scheduledFor) / 1000)}:R>.`;
    case "awaiting_approval":
      return `The next copy is ready and waiting for you. **[Put it up](${publicAppUrl()}/tool?approve=${encodeURIComponent(result.taskId)})**`;
    case "restocking":
      return "Putting the next copy up now. The listing stays at 0 until it's done.";
    case "restocked":
      if (remaining === 0) return "Back in stock. That was the last copy lined up.";
      if (remaining !== undefined) return `Back in stock. ${remaining} more ${remaining === 1 ? "copy" : "copies"} lined up.`;
      return "Back in stock.";
    case "dry_run_ready":
      return "Test mode, so eBay wasn't changed. In live mode this copy would go up now.";
    case "held_at_zero":
      return copy ? "The next copy needs details before it can go up. Listing stays at 0." : "No copies left in line. Listing stays at 0 until you add one.";
    case "skipped":
      return `Not restocked: ${shortPlainText(result.message, 90)}`;
    case "failed":
      return `Not restocked: ${shortPlainText(result.message, 90)}`;
    default:
      return "Open Next for details.";
  }
}

function productEmbed(listing: ListingSnapshot, options: {
  label: string;
  color: number;
  at: Date;
  variationKey?: string | null;
  sold?: number;
  available?: number;
  soldLabel?: string;
  availableLabel?: string;
  summary?: string;
  nextCopy?: string;
  footer?: string;
}): DiscordEmbed {
  const variation = listing.variations.find((item) => item.key === options.variationKey);
  const image = variation?.imageUrls.map(safeProductImage).find(Boolean) ?? listing.imageUrls.map(safeProductImage).find(Boolean);
  const listingUrl = safeListingUrl(listing.listingUrl);
  const embed: DiscordEmbed = {
    author: { name: options.label },
    title: shortProductTitle(listing.title) + (variation ? ` · ${variation.label.slice(0, 30)}` : ""),
    color: options.color,
    timestamp: options.at.toISOString(),
    footer: { text: options.footer ?? `eBay ${listing.itemId}` },
  };
  if (listingUrl) embed.url = listingUrl;
  if (options.summary) embed.description = options.summary;
  if (image) embed.thumbnail = { url: image };
  if (options.sold !== undefined && options.available !== undefined) {
    embed.fields = [
      { name: "Sold", value: options.soldLabel ?? String(options.sold), inline: true },
      { name: "Available", value: options.availableLabel ?? String(options.available), inline: true },
    ];
    if (options.nextCopy) embed.fields.push({ name: "Next copy", value: options.nextCopy, inline: true });
  }
  return embed;
}

/** "$86.99 · 5 photos" or "Same photos" for the copy that goes up next. */
function nextCopyLabel(result: WorkerResult): string | undefined {
  const copy = result.plan?.copy;
  if (!copy) return undefined;
  const parts = [
    copy.targetPrice == null ? null : money(copy.targetPrice, result.listing.currency),
    result.plan?.variationKey ? "Same option" : copy.photoCount ? `${copy.photoCount} photos` : "Same photos",
  ].filter(Boolean);
  return parts.join(" · ");
}

export function buildTestDiscordPayload(at = new Date()): DiscordWebhookPayload {
  return {
    username: "Next",
    embeds: [{
      author: { name: "Connected" },
      title: "Next will post here",
      description: "Sales, restocks, and anything that needs you will show up in this channel. Nothing on eBay was checked or changed.",
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
    { ...base, action: "awaiting_approval" },
    { ...base, action: "held_at_zero", plan: { ...plan, copy: null } },
    { ...base, action: "dry_run_ready" },
    { ...base, action: "failed", message: "eBay did not confirm the queued revision" },
    { ...base, action: "skipped", message: "Listing changed outside Next" },
  ];
  const embeds = results.map((result, index) => {
    const embed = buildWorkerDiscordPayload(result, at)?.embeds?.[0];
    if (!embed) throw new Error("Could not build a Discord alert preview");
    return { ...embed, footer: { text: `Preview ${index + 1} of ${results.length} · Simulated, eBay not changed` } };
  });
  return { username: "Next", embeds };
}

const LABELS: Partial<Record<WorkerResult["action"], string>> = {
  restock_scheduled: "Sold",
  awaiting_approval: "Sold · waiting for your OK",
  restocking: "Restocking",
  restocked: "Restocked",
  dry_run_ready: "Restock ready · test mode",
  held_at_zero: "Out of copies",
  skipped: "Needs review",
  failed: "Restock failed",
};

export function buildWorkerDiscordPayload(result: WorkerResult, at = new Date()): DiscordWebhookPayload | null {
  let label = LABELS[result.action];
  if (!label) return null;
  if (result.action === "restock_scheduled" && result.trigger?.kind === "already_at_zero") label = "Sold out · restock lined up";
  if (result.action === "held_at_zero" && result.plan?.copy) label = "On hold";
  const variation = result.listing.variations.find((item) => item.key === result.plan?.variationKey);
  const trigger = result.plan?.trigger;
  const showChange = result.trigger?.kind === "new_sale" && ["restock_scheduled", "awaiting_approval", "dry_run_ready", "held_at_zero"].includes(result.action);
  const mode = result.plan?.writeMode === "dry-run" || result.action === "dry_run_ready" ? " · Test mode" : "";
  return {
    username: "Next",
    embeds: [productEmbed(result.listing, {
      label,
      color: COLORS[result.action as keyof typeof COLORS],
      at,
      variationKey: result.plan?.variationKey,
      sold: variation?.quantitySold ?? result.listing.quantitySold,
      available: variation?.quantityAvailable ?? result.listing.quantityAvailable,
      soldLabel: showChange ? `${result.trigger!.previousSold} → ${trigger?.currentQuantitySold ?? result.listing.quantitySold}` : undefined,
      availableLabel: showChange ? `${result.trigger!.previousAvailable} → 0` : undefined,
      summary: restockAction(result),
      nextCopy: ["restocked", "failed", "skipped"].includes(result.action) ? undefined : nextCopyLabel(result),
      footer: `eBay ${result.listing.itemId}${mode}`,
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

/** Which alert switch in Settings controls this kind of message. */
export function alertGroup(action: WorkerResult["action"]): keyof ReturnType<typeof discordAlerts> | null {
  if (action === "restock_scheduled") return "sales";
  if (action === "restocking" || action === "restocked" || action === "dry_run_ready") return "restocks";
  if (action === "awaiting_approval" || action === "held_at_zero" || action === "skipped" || action === "failed") return "needsYou";
  return null;
}

export function queueWorkerDiscordUpdate(result: WorkerResult) {
  if (!discordWebhookUrl()) return;
  const group = alertGroup(result.action);
  if (!group || !discordAlerts()[group]) return;
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
