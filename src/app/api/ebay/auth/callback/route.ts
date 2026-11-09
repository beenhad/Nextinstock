import { NextResponse } from "next/server";
import { saveLocalEbayGrant } from "@/lib/server/config";
import {
  EBAY_OAUTH_SCOPES,
  exchangeAuthorizationCode,
} from "@/lib/server/ebay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const expectedState = request.headers
    .get("cookie")
    ?.split(";")
    .map((entry) => entry.trim().split("="))
    .find(([name]) => name === "nextinstock_ebay_oauth_state")?.[1];

  const redirect = (outcome: string) => {
    const response = NextResponse.redirect(new URL(`/tool?ebay=${outcome}`, request.url));
    response.cookies.delete("nextinstock_ebay_oauth_state");
    return response;
  };

  if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
    return redirect("oauth-invalid");
  }

  try {
    const tokens = await exchangeAuthorizationCode(code);
    if (!tokens.refresh_token) throw new Error("eBay returned no refresh token");
    saveLocalEbayGrant(tokens.refresh_token, EBAY_OAUTH_SCOPES);
    return redirect("connected");
  } catch (error) {
    console.error("Nextinstock eBay OAuth callback failed", error);
    return redirect("oauth-error");
  }
}
