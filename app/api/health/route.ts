import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    name: "PaperPilot",
    status: "ok",
    version: "0.1.0",
    processingMode: "browser-first-mvp",
    timestamp: new Date().toISOString()
  });
}
