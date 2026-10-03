import { NextResponse } from "next/server";
import { discordWebhookUrl, saveDiscordWebhookUrl } from "@/lib/server/config";
import { buildPreviewDiscordPayload, buildTestDiscordPayload, configureDiscordWebhook, sendDiscordMessage, validateDiscordWebhookUrl } from "@/lib/server/discord";
import { fetchSellerPreviewListing } from "@/lib/server/ebay";
import { saleTriggerState } from "@/lib/server/sale-trigger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function localRequest(request: Request) {
  const host = request.headers.get("host") ?? "";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const parsedOrigin = new URL(origin);
  return !process.env.VERCEL && ["127.0.0.1", "localhost"].includes(parsedOrigin.hostname) &&
    parsedOrigin.host === host &&
    request.headers.get("content-type")?.startsWith("application/json");
}

export async function POST(request: Request) {
  if (!localRequest(request)) return NextResponse.json({ error: "Open the local app to change Discord settings." }, { status: 403 });
  try {
    const body = await request.json() as { action?: string; webhookUrl?: string };
    if (body.action === "connect") {
      const url = validateDiscordWebhookUrl(body.webhookUrl ?? "");
      saveDiscordWebhookUrl(url);
      try {
        await configureDiscordWebhook(url);
        return NextResponse.json({ connected: true });
      } catch (error) {
        return NextResponse.json({ connected: true, warning: error instanceof Error ? error.message : "Could not set the avatar." });
      }
    }
    if (body.action === "disconnect") {
      saveDiscordWebhookUrl(null);
      return NextResponse.json({ connected: false });
    }
    const url = discordWebhookUrl();
    if (!url) return NextResponse.json({ error: "Connect a Discord webhook first." }, { status: 400 });
    if (body.action === "test") {
      await configureDiscordWebhook(url);
      await sendDiscordMessage(url, buildTestDiscordPayload());
      return NextResponse.json({ sent: true });
    }
    if (body.action === "preview") {
      const listing = await fetchSellerPreviewListing();
      if (saleTriggerState(listing.quantitySold, listing.quantitySold + 1, 0) !== "at_zero") throw new Error("Preview trigger failed");
      await sendDiscordMessage(url, buildPreviewDiscordPayload(listing));
      return NextResponse.json({ sent: true });
    }
    return NextResponse.json({ error: "Unknown Discord action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discord request failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
