import { NextResponse } from "next/server";
import { systemStatus } from "@/lib/server/config";
import { workerHealth } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: { ...systemStatus(), worker: workerHealth() } }, { headers: { "Cache-Control": "no-store" } });
}
