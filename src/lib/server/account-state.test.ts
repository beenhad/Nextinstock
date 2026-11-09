import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { accessToken, fetchListing } from "./ebay";
import { fetchEbayProfile } from "./ebay-profile";
import { saveLocalEbayGrant, systemStatus } from "./config";
import { GET as beginConsent } from "../../app/api/ebay/auth/start/route";
import { GET as finishConsent } from "../../app/api/ebay/auth/callback/route";

const directory = mkdtempSync(path.join(os.tmpdir(), "nextinstock-accounts-"));
process.env.NEXTINSTOCK_DATA_DIR = directory;
process.env.SELLERMAID_ENV_FILE = "";
process.env.EBAY_APP_ID = "fixture-app";
process.env.EBAY_CERT_ID = "fixture-cert";
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; rmSync(directory, { recursive: true, force: true }); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("an account switch during refresh starts a separate token request", async () => {
  const first = deferred<Response>();
  const requests: string[] = [];
  globalThis.fetch = async (_url, options) => {
    const token = new URLSearchParams(options?.body as URLSearchParams).get("refresh_token")!;
    requests.push(token);
    return token === "account-a" ? first.promise : Response.json({ access_token: "token-b", expires_in: 7200 });
  };
  saveLocalEbayGrant("account-a", []);
  const pendingA = accessToken();
  saveLocalEbayGrant("account-b", []);
  assert.equal(await accessToken(), "token-b");
  first.resolve(Response.json({ access_token: "token-a", expires_in: 7200 }));
  assert.equal(await pendingA, "token-a");
  assert.deepEqual(requests, ["account-a", "account-b"]);
  assert.equal(await accessToken(), "token-b");
});

test("out-of-stock preferences are re-read when the seller changes", async () => {
  let seller = "pref-a";
  let preferenceReads = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("oauth2/token")) return Response.json({ access_token: seller, expires_in: 7200 });
    const call = new Headers(options?.headers).get("X-EBAY-API-CALL-NAME");
    if (call === "GetUserPreferences") { preferenceReads++; return new Response(`<Ack>Success</Ack><OutOfStockControlPreference>${seller === "pref-b"}</OutOfStockControlPreference>`); }
    return new Response("<Ack>Success</Ack><Item><ItemID>123456789</ItemID><ListingType>FixedPriceItem</ListingType><ListingDuration>GTC</ListingDuration><Quantity>1</Quantity><SellingStatus><ListingStatus>Active</ListingStatus><QuantitySold>0</QuantitySold></SellingStatus></Item>");
  };
  saveLocalEbayGrant(seller, []);
  assert.equal((await fetchListing("123456789")).outOfStockControl, false);
  seller = "pref-b";
  saveLocalEbayGrant(seller, []);
  assert.equal((await fetchListing("123456789")).outOfStockControl, true);
  assert.equal(preferenceReads, 2);
});

test("a profile load pending for the old account is never joined by the new account", async () => {
  const oldUser = deferred<Response>();
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("oauth2/token")) {
      const account = new URLSearchParams(options?.body as URLSearchParams).get("refresh_token");
      return Response.json({ access_token: account, expires_in: 7200 });
    }
    if (new Headers(options?.headers).get("X-EBAY-API-CALL-NAME") === "GetUser") {
      return new Headers(options?.headers).get("Authorization") === "Bearer profile-a" ? oldUser.promise : new Response("<Ack>Success</Ack><User><UserID>seller-b</UserID></User>");
    }
    return new Response("", { status: 503 });
  };
  saveLocalEbayGrant("profile-a", []);
  const profileA = fetchEbayProfile();
  saveLocalEbayGrant("profile-b", []);
  assert.equal((await fetchEbayProfile()).userId, "seller-b");
  oldUser.resolve(new Response("<Ack>Success</Ack><User><UserID>seller-a</UserID></User>"));
  assert.equal((await profileA).userId, "seller-a");
});

test("a write grant without application credentials does not authorize writes", () => {
  process.env.NEXTINSTOCK_EBAY_WRITE_MODE = "live";
  delete process.env.VERCEL;
  saveLocalEbayGrant("scope-grant", ["https://api.ebay.com/oauth/api_scope/sell.inventory"]);
  process.env.EBAY_APP_ID = "";
  const status = systemStatus();
  assert.equal(status.ebayConfigured, false);
  assert.equal(status.liveWritesAuthorized, false);
  assert.match(status.liveWritesBlocker!, /credentials/);
});

test("consent cookies work on local HTTP, remain secure on HTTPS, and clear on an invalid callback", async () => {
  process.env.EBAY_APP_ID = "fixture-app";
  process.env.EBAY_REDIRECT_RU_NAME = "fixture-redirect";
  const local = await beginConsent(new Request("http://127.0.0.1/api/ebay/auth/start"));
  assert.doesNotMatch(local.headers.get("set-cookie")!, /;\s*Secure/i);
  const secure = await beginConsent(new Request("https://example.com/api/ebay/auth/start"));
  assert.match(secure.headers.get("set-cookie")!, /;\s*Secure/i);
  const invalid = await finishConsent(new Request("http://127.0.0.1/api/ebay/auth/callback?state=wrong"));
  assert.match(invalid.headers.get("location")!, /oauth-invalid/);
  assert.match(invalid.headers.get("set-cookie")!, /expires=Thu, 01 Jan 1970/i);
});
