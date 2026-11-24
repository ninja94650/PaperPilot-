import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;
const maxBytes = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const workerUrl = process.env.DOCUMENT_WORKER_URL;
  const workerToken = process.env.DOCUMENT_WORKER_TOKEN;
  if (!workerUrl || !workerToken) {
    return NextResponse.json({ error: "DOCX/PPTX conversion is not connected yet. Configure the isolated LibreOffice worker in the deployment environment." }, { status: 503 });
  }

  let supabase;
  try { supabase = await createClient(); }
  catch { return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 }); }
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Sign in is required for Office conversion." }, { status: 401 });

  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a DOC or PPT file." }, { status: 400 });
  if (file.size < 1 || file.size > maxBytes) return NextResponse.json({ error: "Files must be between 1 byte and 20 MB." }, { status: 413 });
  if (!/\.(docx?|pptx?)$/i.test(file.name)) return NextResponse.json({ error: "Only DOC, DOCX, PPT and PPTX files are accepted." }, { status: 415 });

  const body = new FormData();
  body.append("file", file, file.name);
  let target: URL;
  try { target = new URL("/convert", workerUrl); }
  catch { return NextResponse.json({ error: "The document worker URL is invalid." }, { status: 500 }); }
  let response: Response;
  try {
    response = await fetch(target, {
      method: "POST",
      headers: { Authorization: "Bearer " + workerToken },
      body,
      signal: AbortSignal.timeout(110_000),
      cache: "no-store"
    });
  } catch {
    return NextResponse.json({ error: "The document worker did not respond. Try again later." }, { status: 502 });
  }
  if (!response.ok) return NextResponse.json({ error: "The document worker could not convert this file (status " + response.status + ")." }, { status: 502 });
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > 40 * 1024 * 1024) return NextResponse.json({ error: "The conversion worker returned an oversized file." }, { status: 502 });
  const reader = response.body?.getReader();
  if (!reader) return NextResponse.json({ error: "The conversion worker returned an empty response." }, { status: 502 });
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > 40 * 1024 * 1024) {
      await reader.cancel();
      return NextResponse.json({ error: "The conversion worker returned an oversized file." }, { status: 502 });
    }
    chunks.push(value);
  }
  if (totalBytes < 5) return NextResponse.json({ error: "The conversion worker returned an invalid file size." }, { status: 502 });
  const result = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  const signature = result.subarray(0, 5).toString("ascii");
  if (signature !== "%PDF-") return NextResponse.json({ error: "The conversion worker response was not a valid PDF." }, { status: 502 });
  return new NextResponse(result, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=\"paperpilot-converted.pdf\"",
      "Cache-Control": "private, no-store"
    }
  });
}
