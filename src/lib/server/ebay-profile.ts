import { createHash } from "node:crypto";
import type { EbayProfile } from "@/lib/types";
import { ebayCredentials } from "./config";
import { callTradingApi } from "./ebay";

const PROFILE_CACHE_MS = 10 * 60_000;
let cachedProfile: { key: string; expiresAt: number; value: EbayProfile } | null = null;
let pendingProfile: Promise<EbayProfile> | null = null;

export function parseEbayUserId(xml: string): string | null {
  const user = xml.match(/<User(?:\s[^>]*)?>([\s\S]*?)<\/User>/)?.[1];
  const value = user?.match(/<UserID>([\s\S]*?)<\/UserID>/)?.[1]?.trim();
  return value && /^[\w.-]{1,64}$/.test(value) ? value : null;
}

function ebayImageUrl(value: string): string | null {
  const decoded = value
    .replaceAll("\\/", "/")
    .replaceAll("\\u002F", "/")
    .replaceAll("&amp;", "&")
    .replaceAll("&#x2F;", "/")
    .replaceAll("&#47;", "/");
  try {
    const url = new URL(decoded);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "ebayimg.com" && !url.hostname.endsWith(".ebayimg.com")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function parseEbayProfileAvatar(html: string): string | null {
  // The public feedback page places the seller photo in .userImage.
  // Restrict extraction to that area so a listing photo cannot become an avatar.
  const userImage = html.match(/<[^>]+class=["']?userImage\b[^>]*>[\s\S]{0,500}?<img\b[^>]*>/i)?.[0];
  const tagSource = userImage?.match(/\bsrc=(?:["']([^"']+)["']|([^\s>]+))/i);
  const imageFromTag = tagSource?.[1] ?? tagSource?.[2];
  if (imageFromTag) {
    const image = ebayImageUrl(imageFromTag);
    if (image) return image;
  }
  const named = html.match(/(?:avatarUrl|profilePictureUrl|profileImageUrl|userImageUrl|userAvatarUrl|avatarURL)["']?\s*[:=]\s*["']([^"']+)["']/i)?.[1];
  if (named) {
    const image = ebayImageUrl(named);
    if (image) return image;
  }
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/(?:og:image|twitter:image)/i.test(tag)) continue;
    const image = tag.match(/\bcontent=["']([^"']+)["']/i)?.[1];
    if (image) {
      const url = ebayImageUrl(image);
      if (url) return url;
    }
  }
  return null;
}

async function loadEbayProfile(): Promise<EbayProfile> {
  const xml = await callTradingApi("GetUser", `<?xml version="1.0" encoding="utf-8"?>
<GetUserRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <DetailLevel>ReturnSummary</DetailLevel>
  <Version>1451</Version>
</GetUserRequest>`);
  const userId = parseEbayUserId(xml);
  if (!userId) throw new Error("eBay did not return the connected user ID");
  const profileUrl = `https://www.ebay.com/usr/${encodeURIComponent(userId)}`;
  const feedbackUrl = `https://www.ebay.com/fdbk/feedback_profile/${encodeURIComponent(userId)}`;
  let avatarUrl: string | null = null;
  try {
    const response = await fetch(feedbackUrl, {
      cache: "no-store",
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(5000),
    });
    const host = new URL(response.url).hostname;
    if (response.ok && (host === "ebay.com" || host.endsWith(".ebay.com"))) {
      avatarUrl = parseEbayProfileAvatar((await response.text()).slice(0, 2_000_000));
    }
  } catch {
    // The public profile can be unavailable even while the account API works.
  }
  return { userId, avatarUrl, profileUrl };
}

export async function fetchEbayProfile(): Promise<EbayProfile> {
  const refreshToken = ebayCredentials().refreshToken;
  if (!refreshToken) throw new Error("eBay is not connected");
  const key = createHash("sha256").update(refreshToken).digest("hex");
  if (cachedProfile?.key === key && cachedProfile.expiresAt > Date.now()) return cachedProfile.value;
  if (pendingProfile) return pendingProfile;
  pendingProfile = loadEbayProfile().then((value) => {
    cachedProfile = { key, expiresAt: Date.now() + PROFILE_CACHE_MS, value };
    return value;
  }).finally(() => { pendingProfile = null; });
  return pendingProfile;
}
