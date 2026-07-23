import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv, parse } from "dotenv";
import type { EbayWriteMode, SystemStatus } from "@/lib/types";

loadDotenv({
  path: path.join(process.cwd(), ".env.local"),
  override: false,
  quiet: true,
});

const SELLERMAID_EBAY_KEYS = [
  "EBAY_APP_ID",
  "EBAY_CERT_ID",
  "EBAY_REDIRECT_RU_NAME",
  "EBAY_REFRESH_TOKEN",
] as const;

let sellerMaidEnvLoaded = false;

function loadSellerMaidEnv() {
  if (sellerMaidEnvLoaded) return;
  sellerMaidEnvLoaded = true;

  const file = process.env.SELLERMAID_ENV_FILE?.trim();
  if (!file || !existsSync(file)) return;

  const parsed = parse(readFileSync(file));
  for (const key of SELLERMAID_EBAY_KEYS) {
    if (!process.env[key] && parsed[key]) process.env[key] = parsed[key];
  }
}

export function dataDirectory(): string {
  const configured = process.env.NEXTINSTOCK_DATA_DIR?.trim();
  const directory =
    configured ||
    (process.env.VERCEL ? path.join("/tmp", "nextinstock") : path.join(process.cwd(), ".nextinstock"));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
}

export function imageDirectory(): string {
  const directory = path.join(dataDirectory(), "images");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
}

function secretsPath(): string {
  return path.join(dataDirectory(), "secrets.json");
}

interface LocalSecrets {
  ebayRefreshToken?: string;
  ebayGrantedScopes?: string[];
  updatedAt?: string;
}

function readLocalSecrets(): LocalSecrets {
  try {
    return JSON.parse(readFileSync(secretsPath(), "utf8")) as LocalSecrets;
  } catch {
    return {};
  }
}

export function saveLocalEbayGrant(refreshToken: string, scopes: string[]) {
  const payload: LocalSecrets = {
    ebayRefreshToken: refreshToken,
    ebayGrantedScopes: scopes,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(secretsPath(), JSON.stringify(payload, null, 2), { mode: 0o600 });
  chmodSync(secretsPath(), 0o600);
}

export function ebayCredentials() {
  loadSellerMaidEnv();
  const local = readLocalSecrets();
  const appId = process.env.EBAY_APP_ID?.trim() ?? "";
  const certId = process.env.EBAY_CERT_ID?.trim() ?? "";
  const ruName = process.env.EBAY_REDIRECT_RU_NAME?.trim() ?? "";
  const refreshToken = local.ebayRefreshToken?.trim() || process.env.EBAY_REFRESH_TOKEN?.trim() || "";
  const source = local.ebayRefreshToken
    ? "nextinstock"
    : process.env.SELLERMAID_ENV_FILE
      ? "sellermaid"
      : "missing";

  return {
    appId,
    certId,
    ruName,
    refreshToken,
    grantedScopes: local.ebayGrantedScopes ?? [],
    source: source as "nextinstock" | "sellermaid" | "missing",
  };
}

export function ebayWriteMode(): EbayWriteMode {
  return process.env.NEXTINSTOCK_EBAY_WRITE_MODE === "live" ? "live" : "dry-run";
}

export function pollSeconds(): number {
  const configured = Number(process.env.NEXTINSTOCK_POLL_SECONDS ?? 30);
  return Number.isFinite(configured) ? Math.max(15, Math.min(3600, Math.trunc(configured))) : 30;
}

export function defaultItemId(): string {
  return process.env.NEXTINSTOCK_ITEM_ID?.trim() || "266994813467";
}

export function systemStatus(): SystemStatus {
  const credentials = ebayCredentials();
  const requiredWriteScope = "https://api.ebay.com/oauth/api_scope/sell.inventory";
  const hasLocalWriteGrant =
    credentials.source === "nextinstock" && credentials.grantedScopes.includes(requiredWriteScope);
  const writeMode = ebayWriteMode();
  let liveWritesBlocker: string | null = null;
  if (writeMode !== "live") {
    liveWritesBlocker = "Write mode is dry-run.";
  } else if (!hasLocalWriteGrant) {
    liveWritesBlocker = "Reconnect eBay in Nextinstock with sell.inventory permission.";
  }

  return {
    ebayConfigured: Boolean(credentials.appId && credentials.certId && credentials.refreshToken),
    ebayCredentialSource: credentials.source,
    writeMode,
    storageDriver: "local",
    storagePath: imageDirectory(),
    persistentStorage: !process.env.VERCEL,
    pollSeconds: pollSeconds(),
    defaultItemId: defaultItemId(),
    liveWritesAuthorized: writeMode === "live" && hasLocalWriteGrant,
    liveWritesBlocker,
  };
}
