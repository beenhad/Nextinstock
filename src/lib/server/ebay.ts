import { createHash } from "node:crypto";
import type { ListingSnapshot, ListingVariation } from "@/lib/types";
import { ebayCredentials } from "./config";

const EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_TRADING_API_URL = "https://api.ebay.com/ws/api.dll";
const EBAY_MEDIA_IMAGE_URL =
  "https://apim.ebay.com/commerce/media/v1_beta/image/create_image_from_file";
const ACCESS_TOKEN_SKEW_MS = 60_000;

export const EBAY_WRITE_SCOPE = "https://api.ebay.com/oauth/api_scope/sell.inventory";
export const EBAY_OAUTH_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  EBAY_WRITE_SCOPE,
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
];

interface AccessTokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

let cachedAccessToken: { token: string; expiresAt: number; refreshToken: string } | null = null;
let inflightRefresh: Promise<string> | null = null;
let cachedOutOfStockControl: { value: boolean | null; expiresAt: number } | null = null;

function decodeXml(value: string | null): string | null {
  if (value === null) return null;
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function tagValue(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}(?: [^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
  return decodeXml(match?.[1] ?? null);
}

function rawTagValue(xml: string, tag: string): string | null {
  return xml.match(new RegExp(`<${tag}(?: [^>]*)?>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? null;
}

function tagBlocks(xml: string, tag: string): string[] {
  return Array.from(
    xml.matchAll(new RegExp(`<${tag}(?: [^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "g")),
    (match) => match[1],
  );
}

function numeric(value: string | null, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseVariations(variationsXml: string, fallbackImageUrls: string[]): {
  variations: ListingVariation[];
  pictureAxis: string | null;
} {
  const pictures = rawTagValue(variationsXml, "Pictures") ?? "";
  const pictureAxis = tagValue(pictures, "VariationSpecificName");
  const pictureSets = new Map(
    tagBlocks(pictures, "VariationSpecificPictureSet").map((block) => [
      tagValue(block, "VariationSpecificValue") ?? "",
      tagBlocks(block, "PictureURL").map((url) => decodeXml(url)).filter((url): url is string => Boolean(url)),
    ]),
  );
  const variations = tagBlocks(variationsXml, "Variation").map((block) => {
    const specifics = tagBlocks(rawTagValue(block, "VariationSpecifics") ?? "", "NameValueList")
      .map((entry) => ({ name: tagValue(entry, "Name") ?? "", value: tagValue(entry, "Value") ?? "" }))
      .filter((entry) => entry.name && entry.value);
    const sku = tagValue(block, "SKU");
    const identity = specifics.length
      ? JSON.stringify([...specifics].sort((a, b) => a.name.localeCompare(b.name)))
      : `sku:${sku ?? ""}`;
    const key = createHash("sha256").update(identity).digest("hex").slice(0, 24);
    const quantityTotal = numeric(tagValue(block, "Quantity"));
    const quantitySold = numeric(tagValue(rawTagValue(block, "SellingStatus") ?? "", "QuantitySold"));
    const explicitAvailable = tagValue(block, "QuantityAvailable");
    const priceBlock = rawTagValue(block, "StartPrice") ?? "";
    const price = numeric(decodeXml(priceBlock), Number.NaN);
    const pictureValue = specifics.find((entry) => entry.name === pictureAxis)?.value ?? "";
    const specificPhotos = pictureSets.get(pictureValue) ?? [];
    return {
      key,
      sku,
      specifics,
      label: specifics.map(({ name, value }) => `${name}: ${value}`).join(" · ") || sku || "Unnamed variation",
      price: Number.isFinite(price) ? price : null,
      currency: priceBlock.match(/currencyID="([^"]+)"/)?.[1] ?? "USD",
      quantityTotal,
      quantitySold,
      quantityAvailable: explicitAvailable === null
        ? Math.max(0, quantityTotal - quantitySold)
        : Math.max(0, numeric(explicitAvailable)),
      imageUrls: specificPhotos.length ? specificPhotos : fallbackImageUrls,
      hasSpecificPhotos: specificPhotos.length > 0,
    } satisfies ListingVariation;
  });
  return { variations, pictureAxis };
}

function credentialsOrThrow() {
  const credentials = ebayCredentials();
  if (!credentials.appId || !credentials.certId || !credentials.refreshToken) {
    throw new Error("eBay is not configured");
  }
  return credentials;
}

async function parseFailure(response: Response): Promise<Error> {
  const text = await response.text();
  return new Error(`eBay request failed: ${response.status} ${text.slice(0, 1500)}`);
}

async function freshAccessToken(): Promise<string> {
  const credentials = credentialsOrThrow();
  const basic = Buffer.from(`${credentials.appId}:${credentials.certId}`).toString("base64");
  const response = await fetch(EBAY_TOKEN_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
    }),
  });
  if (!response.ok) throw await parseFailure(response);
  const payload = (await response.json()) as AccessTokenResponse;
  if (!payload.access_token) throw new Error("eBay token refresh returned no access token");
  cachedAccessToken = {
    token: payload.access_token,
    refreshToken: credentials.refreshToken,
    expiresAt:
      Date.now() + Math.max((payload.expires_in ?? 7200) * 1000, ACCESS_TOKEN_SKEW_MS),
  };
  return payload.access_token;
}

export async function accessToken(): Promise<string> {
  const credentials = credentialsOrThrow();
  if (
    cachedAccessToken &&
    cachedAccessToken.refreshToken === credentials.refreshToken &&
    cachedAccessToken.expiresAt > Date.now() + ACCESS_TOKEN_SKEW_MS
  ) {
    return cachedAccessToken.token;
  }
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = freshAccessToken().finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
}

export async function callTradingApi(callName: string, xml: string): Promise<string> {
  const token = await accessToken();
  const response = await fetch(EBAY_TRADING_API_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/xml",
      "X-EBAY-API-CALL-NAME": callName,
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1451",
      "X-EBAY-API-SITEID": "0",
      "X-EBAY-API-IAF-TOKEN": token,
    },
    body: xml,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`eBay Trading API failed: ${response.status} ${text}`);
  const ack = tagValue(text, "Ack");
  if (ack && ack !== "Success" && ack !== "Warning") {
    const shortMessage = tagValue(text, "ShortMessage");
    const longMessage = tagValue(text, "LongMessage");
    throw new Error(`eBay ${callName} failed: ${longMessage || shortMessage || "Unknown error"}`);
  }
  return text;
}

async function outOfStockControlPreference(): Promise<boolean | null> {
  if (cachedOutOfStockControl && cachedOutOfStockControl.expiresAt > Date.now()) {
    return cachedOutOfStockControl.value;
  }
  try {
    const xml = await callTradingApi(
      "GetUserPreferences",
      `<?xml version="1.0" encoding="utf-8"?>
<GetUserPreferencesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ShowOutOfStockControlPreference>true</ShowOutOfStockControlPreference>
  <Version>1451</Version>
</GetUserPreferencesRequest>`,
    );
    const value = tagValue(xml, "OutOfStockControlPreference") === "true";
    cachedOutOfStockControl = { value, expiresAt: Date.now() + 10 * 60_000 };
    return value;
  } catch {
    cachedOutOfStockControl = { value: null, expiresAt: Date.now() + 60_000 };
    return null;
  }
}

export async function fetchListing(itemId: string): Promise<ListingSnapshot> {
  if (!/^\d{9,15}$/.test(itemId)) throw new Error("Enter a valid eBay item number");
  const [xml, outOfStockControl] = await Promise.all([
    callTradingApi(
      "GetItem",
      `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${escapeXml(itemId)}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeItemSpecifics>false</IncludeItemSpecifics>
  <Version>1451</Version>
</GetItemRequest>`,
    ),
    outOfStockControlPreference(),
  ]);
  const item = rawTagValue(xml, "Item");
  if (!item) throw new Error(`eBay item ${itemId} was not returned`);
  const sellingStatus = rawTagValue(item, "SellingStatus") ?? "";
  const pictureDetails = rawTagValue(item, "PictureDetails") ?? "";
  const variations = rawTagValue(item, "Variations");
  const listingType = tagValue(item, "ListingType") ?? "Unknown";
  const listingStatus = tagValue(sellingStatus, "ListingStatus") ?? "Unknown";
  const listingDuration = tagValue(item, "ListingDuration");
  const quantityTotal = numeric(tagValue(item, "Quantity"));
  const quantitySold = numeric(tagValue(sellingStatus, "QuantitySold"));
  const explicitAvailable = tagValue(item, "QuantityAvailable");
  const quantityAvailable =
    explicitAvailable === null
      ? Math.max(0, quantityTotal - quantitySold)
      : Math.max(0, numeric(explicitAvailable));
  const imageUrls = tagBlocks(pictureDetails, "PictureURL")
    .map((value) => decodeXml(value))
    .filter((value): value is string => Boolean(value));
  const parsedVariations = variations ? parseVariations(variations, imageUrls) : { variations: [], pictureAxis: null };
  const variationCount = parsedVariations.variations.length;
  const priceBlock = rawTagValue(sellingStatus, "CurrentPrice") ?? "";
  const price = numeric(decodeXml(priceBlock), Number.NaN);
  const unsupportedReasons: string[] = [];
  if (!["FixedPriceItem", "StoresFixedPrice"].includes(listingType)) {
    unsupportedReasons.push("Only fixed-price listings are supported");
  }
  if (listingDuration !== "GTC") unsupportedReasons.push("The listing must be Good 'Til Cancelled");
  if (listingStatus !== "Active") unsupportedReasons.push("The listing must be active");
  if (variationCount === 0 && quantityAvailable > 1) {
    unsupportedReasons.push("The listing must have at most one available copy");
  }
  if (outOfStockControl === false) {
    unsupportedReasons.push("Enable eBay Out-of-Stock Control before activating a task");
  }
  if (outOfStockControl === null) {
    unsupportedReasons.push("Nextinstock could not confirm the Out-of-Stock Control setting");
  }

  return {
    itemId: tagValue(item, "ItemID") ?? itemId,
    sku: tagValue(item, "SKU"),
    title: tagValue(item, "Title") ?? itemId,
    listingUrl: tagValue(item, "ViewItemURLForNaturalSearch") ??
      tagValue(item, "ViewItemURL") ??
      `https://www.ebay.com/itm/${itemId}`,
    listingType,
    listingStatus,
    listingDuration,
    conditionId: tagValue(item, "ConditionID"),
    conditionName: tagValue(item, "ConditionDisplayName"),
    conditionDescription: tagValue(item, "ConditionDescription"),
    price: Number.isFinite(price) ? price : null,
    currency: priceBlock.match(/currencyID="([^"]+)"/)?.[1] ?? "USD",
    quantityTotal,
    quantitySold,
    quantityAvailable,
    imageUrls,
    variationCount,
    variations: parsedVariations.variations,
    variationPictureAxis: parsedVariations.pictureAxis,
    outOfStockControl,
    supported: unsupportedReasons.length === 0,
    unsupportedReasons,
    fetchedAt: new Date().toISOString(),
  };
}

export function sellerPreviewCandidateIds(xml: string): string[] {
  const items = tagBlocks(rawTagValue(xml, "ItemArray") ?? "", "Item");
  return items.map((item) => {
    const status = tagValue(rawTagValue(item, "SellingStatus") ?? "", "ListingStatus");
    const itemId = tagValue(item, "ItemID");
    const pictures = tagBlocks(rawTagValue(item, "PictureDetails") ?? "", "PictureURL");
    const sold = numeric(tagValue(rawTagValue(item, "SellingStatus") ?? "", "QuantitySold"));
    const available = tagValue(item, "QuantityAvailable");
    const quantity = available === null ? Math.max(0, numeric(tagValue(item, "Quantity")) - sold) : numeric(available);
    return { itemId, status, pictures, quantity };
  }).filter((item) => item.itemId && item.status === "Active" && item.pictures.length && item.quantity > 0)
    .sort((a, b) => Number(b.quantity === 1) - Number(a.quantity === 1))
    .map((item) => item.itemId as string);
}

export async function fetchSellerPreviewListing(): Promise<ListingSnapshot> {
  const now = new Date();
  const end = new Date(now.getTime() + 119 * 24 * 60 * 60 * 1000);
  const xml = await callTradingApi("GetSellerList", `<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <EndTimeFrom>${now.toISOString()}</EndTimeFrom>
  <EndTimeTo>${end.toISOString()}</EndTimeTo>
  <GranularityLevel>Fine</GranularityLevel>
  <Pagination><EntriesPerPage>20</EntriesPerPage><PageNumber>1</PageNumber></Pagination>
  <Version>1451</Version>
</GetSellerListRequest>`);
  for (const itemId of sellerPreviewCandidateIds(xml).slice(0, 5)) {
    const listing = await fetchListing(itemId);
    if (listing.listingStatus === "Active" && listing.quantityAvailable === 1 &&
        listing.imageUrls.some((value) => {
          try {
            const url = new URL(value);
            return url.protocol === "https:" && (url.hostname === "ebayimg.com" || url.hostname.endsWith(".ebayimg.com"));
          } catch { return false; }
        })) return listing;
  }
  throw new Error("No active one-unit listing with a public photo was found in the connected eBay store.");
}

export interface EbayImageUpload {
  imageId: string;
  imageUrl: string;
  expirationDate: string | null;
}

export async function uploadImageToEbay(input: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<EbayImageUpload> {
  const token = await accessToken();
  const form = new FormData();
  form.append(
    "image",
    new Blob([new Uint8Array(input.buffer)], { type: input.mimeType }),
    input.filename,
  );
  const response = await fetch(EBAY_MEDIA_IMAGE_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
    body: form,
  });
  if (!response.ok) throw await parseFailure(response);
  const payload = (await response.json()) as {
    imageUrl?: string;
    expirationDate?: string;
  };
  const location = response.headers.get("location") ?? "";
  const imageId = location.split("/").filter(Boolean).at(-1) ?? "";
  if (!imageId || !payload.imageUrl) {
    throw new Error("eBay image upload returned no image ID or EPS URL");
  }
  return {
    imageId,
    imageUrl: payload.imageUrl,
    expirationDate: payload.expirationDate ?? null,
  };
}

export async function reviseFixedPriceListing(input: {
  itemId: string;
  conditionId: string | null;
  conditionDescription: string;
  pictureUrls: string[];
  availableQuantity: number;
  targetPrice?: number | null;
  currency?: string;
}) {
  if (input.pictureUrls.length === 0) throw new Error("At least one eBay picture URL is required");
  if (input.targetPrice !== null && input.targetPrice !== undefined && (!Number.isFinite(input.targetPrice) || input.targetPrice <= 0)) {
    throw new Error("Invalid planned eBay price");
  }
  const conditionIdXml = input.conditionId
    ? `<ConditionID>${escapeXml(input.conditionId)}</ConditionID>`
    : "";
  const pictureXml = input.pictureUrls
    .map((url) => `<PictureURL>${escapeXml(url)}</PictureURL>`)
    .join("");
  const priceXml = input.targetPrice === null || input.targetPrice === undefined
    ? ""
    : `<StartPrice currencyID="${escapeXml(input.currency ?? "USD")}">${input.targetPrice.toFixed(2)}</StartPrice>`;
  await callTradingApi(
    "ReviseFixedPriceItem",
    `<?xml version="1.0" encoding="utf-8"?>
<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Item>
    <ItemID>${escapeXml(input.itemId)}</ItemID>
    ${conditionIdXml}
    <ConditionDescription>${escapeXml(input.conditionDescription)}</ConditionDescription>
    ${priceXml}
    <PictureDetails>
      <PictureSource>EPS</PictureSource>
      ${pictureXml}
    </PictureDetails>
    <Quantity>${Math.max(0, Math.trunc(input.availableQuantity))}</Quantity>
  </Item>
  <Version>1451</Version>
</ReviseFixedPriceItemRequest>`,
  );
}

export async function reviseFixedPriceQuantity(itemId: string, availableQuantity: number) {
  await callTradingApi(
    "ReviseFixedPriceItem",
    `<?xml version="1.0" encoding="utf-8"?>
<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Item>
    <ItemID>${escapeXml(itemId)}</ItemID>
    <Quantity>${Math.max(0, Math.trunc(availableQuantity))}</Quantity>
  </Item>
  <Version>1451</Version>
</ReviseFixedPriceItemRequest>`,
  );
}

export function variationQuantityRequest(itemId: string, variation: ListingVariation, availableQuantity: number, targetPrice?: number | null): string {
  const price = targetPrice ?? variation.price;
  if (price === null || !Number.isFinite(price) || price <= 0) throw new Error("Variation has no valid eBay price");
  if (!variation.specifics.length) throw new Error("Variation has no option values");
  if (!Number.isInteger(availableQuantity) || availableQuantity < 0) throw new Error("Invalid variation quantity");
  const specifics = variation.specifics.map(({ name, value }) =>
    `<NameValueList><Name>${escapeXml(name)}</Name><Value>${escapeXml(value)}</Value></NameValueList>`,
  ).join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Item><ItemID>${escapeXml(itemId)}</ItemID><Variations><Variation>
    ${variation.sku ? `<SKU>${escapeXml(variation.sku)}</SKU>` : ""}
    <StartPrice currencyID="${escapeXml(variation.currency)}">${price.toFixed(2)}</StartPrice>
    <Quantity>${availableQuantity}</Quantity>
    <VariationSpecifics>${specifics}</VariationSpecifics>
  </Variation></Variations></Item>
  <Version>1451</Version>
</ReviseFixedPriceItemRequest>`;
}

export async function reviseFixedPriceVariationQuantity(itemId: string, variation: ListingVariation, availableQuantity: number, targetPrice?: number | null) {
  await callTradingApi("ReviseFixedPriceItem", variationQuantityRequest(itemId, variation, availableQuantity, targetPrice));
}

export function ebayConsentUrl(state: string): string {
  const credentials = ebayCredentials();
  if (!credentials.appId || !credentials.ruName) {
    throw new Error("EBAY_APP_ID and EBAY_REDIRECT_RU_NAME are required");
  }
  const parameters = new URLSearchParams({
    client_id: credentials.appId,
    redirect_uri: credentials.ruName,
    response_type: "code",
    scope: EBAY_OAUTH_SCOPES.join(" "),
    state,
  });
  return `https://auth.ebay.com/oauth2/authorize?${parameters.toString()}`;
}

export async function exchangeAuthorizationCode(code: string): Promise<AccessTokenResponse> {
  const credentials = ebayCredentials();
  if (!credentials.appId || !credentials.certId || !credentials.ruName) {
    throw new Error("eBay application credentials are incomplete");
  }
  const basic = Buffer.from(`${credentials.appId}:${credentials.certId}`).toString("base64");
  const response = await fetch(EBAY_TOKEN_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: credentials.ruName,
    }),
  });
  if (!response.ok) throw await parseFailure(response);
  return response.json() as Promise<AccessTokenResponse>;
}
