import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({
    error: "Synchronous Office conversion has been retired. Upload to your private library and submit a secure processing job instead."
  }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
