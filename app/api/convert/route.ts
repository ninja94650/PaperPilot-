import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;
const maxBytes = 20 * 1024 * 1024;
const maxOutputBytes = 40 * 1024 * 1024;

export async function POST(request: Request) {
  const workerUrl = process.env.DOCUMENT_WORKER_URL;
  const workerToken = process.env.DOCUMENT_WORKER_TOKEN;
  if (!workerUrl || !workerToken) {
    return NextResponse.json({ error: "DOCX/PPTX conversion is not connected yet. Configure the isolated LibreOffice worker in the deployment environment." }, { status: 503 });
  }

  const supabase = await createClient().catch(() => null);
  if (!supabase) return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  const { data: userData, error: authError } = await supabase.auth.getUser();
  const user = userData.user;
  if (authError || !user) return NextResponse.json({ error: "Sign in is required for Office conversion." }, { status: 401 });
  const ownerId = user.id;

  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a DOC or PPT file." }, { status: 400 });
  if (file.size < 1 || file.size > maxBytes) return NextResponse.json({ error: "Files must be between 1 byte and 20 MB." }, { status: 413 });
  if (!/\.(docx?|pptx?)$/i.test(file.name)) return NextResponse.json({ error: "Only DOC, DOCX, PPT and PPTX files are accepted." }, { status: 415 });

  const { data: job, error: jobError } = await supabase.from("processing_jobs").insert({
    owner_id: user.id,
    tool: "office-to-pdf",
    status: "running",
    input_metadata: { file_name: file.name, size_bytes: file.size }
  }).select("id").single();
  if (jobError || !job) return NextResponse.json({ error: "Could not create a processing record. Try again." }, { status: 500 });
  const jobId = job.id;

  async function fail(message: string, status: number) {
    await supabase.from("processing_jobs").update({
      status: "failed",
      error_message: message.slice(0, 500),
      completed_at: new Date().toISOString()
    }).eq("id", jobId).eq("owner_id", ownerId);
    return NextResponse.json({ error: message, jobId }, { status });
  }

  try {
    const body = new FormData();
    body.append("file", file, file.name);
    const target = new URL("/convert", workerUrl);
    const response = await fetch(target, {
      method: "POST",
      headers: { Authorization: "Bearer " + workerToken },
      body,
      signal: AbortSignal.timeout(110_000),
      cache: "no-store"
    });
    if (!response.ok) return fail("The document worker could not convert this file (status " + response.status + ").", 502);

    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > maxOutputBytes) return fail("The conversion worker returned an oversized file.", 502);
    const reader = response.body?.getReader();
    if (!reader) return fail("The conversion worker returned an empty response.", 502);
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxOutputBytes) {
        await reader.cancel();
        return fail("The conversion worker returned an oversized file.", 502);
      }
      chunks.push(value);
    }
    if (totalBytes < 5) return fail("The conversion worker returned an invalid file size.", 502);
    const result = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    if (result.subarray(0, 5).toString("ascii") !== "%PDF-") return fail("The conversion worker response was not a valid PDF.", 502);

    const { error: updateError } = await supabase.from("processing_jobs").update({
      status: "succeeded",
      output_metadata: { output_size_bytes: result.byteLength, mime_type: "application/pdf" },
      completed_at: new Date().toISOString()
    }).eq("id", jobId).eq("owner_id", ownerId);
    if (updateError) return fail("The conversion finished but its history could not be saved. Please retry.", 500);

    const responseBody = new ArrayBuffer(result.byteLength);
    new Uint8Array(responseBody).set(result);
    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"paperpilot-converted.pdf\"",
        "Cache-Control": "private, no-store",
        "X-PaperPilot-Job-Id": jobId
      }
    });
  } catch {
    return fail("The document worker did not respond in time. Try again later.", 502);
  }
}
