import { NextResponse } from "next/server";
import { listActivity } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { events: listActivity() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
