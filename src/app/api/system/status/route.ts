import { NextResponse } from "next/server";
import { systemStatus } from "@/lib/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: systemStatus() }, { headers: { "Cache-Control": "no-store" } });
}
