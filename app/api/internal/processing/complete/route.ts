import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedWorker } from "@/lib/processing/worker-auth";

export const runtime = "nodejs";
const maxOutputBytes = 40 * 1024 * 1024;

export async function POST(request: NextRequest) {
  if (!isAuthorizedWorker(request)) return NextResponse.json({ error: "Unauthorized worker request." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "A JSON completion payload is required." }, { status: 400 }); }
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  const workerId = typeof body.workerId === "string" ? body.workerId : "";
  const attempt = Number(body.attempt);
  const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
  const sizeBytes = Number(body.sizeBytes);
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || !/^[A-Za-z0-9._:-]{3,80}$/.test(workerId)
    || !Number.isInteger(attempt) || attempt < 1 || !Number.isInteger(sizeBytes)
    || sizeBytes < 5 || sizeBytes > maxOutputBytes) {
    return NextResponse.json({ error: "Invalid completion metadata." }, { status: 400 });
  }

  let admin;
  try { admin = createAdminClient(); }
  catch { return NextResponse.json({ error: "Worker output storage is not configured." }, { status: 503 }); }
  const { data: job, error: jobError } = await admin.from("processing_jobs")
    .select("id,owner_id,document_id,status,worker_id,lease_expires_at,attempt_count,output_storage_path")
    .eq("id", jobId).maybeSingle();
  if (jobError) return NextResponse.json({ error: "Could not verify the processing job." }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Processing job not found." }, { status: 404 });

  // A retry after a lost HTTP response returns the already-published revision.
  if (job.status === "succeeded" && job.output_storage_path === storagePath) {
    const { data: existing, error: existingError } = await admin.from("document_revisions")
      .select("id,version").eq("processing_job_id", job.id).maybeSingle();
    if (existingError || !existing) return NextResponse.json({ error: "The published revision could not be recovered." }, { status: 500 });
    return NextResponse.json({ ok: true, revisionId: existing.id, version: existing.version, reused: true }, {
      headers: { "Cache-Control": "no-store" }
    });
  }

  if (job.status !== "running" || job.worker_id !== workerId || job.attempt_count !== attempt
    || !job.lease_expires_at || new Date(job.lease_expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "The worker lease is no longer valid." }, { status: 409 });
  }
  if (!job.document_id || job.output_storage_path !== storagePath
    || storagePath !== job.owner_id + "/" + job.id + "/attempt-" + attempt + "/result.pdf") {
    return NextResponse.json({ error: "The output path is not scoped to this job and owner." }, { status: 403 });
  }

  const folder = storagePath.slice(0, storagePath.lastIndexOf("/"));
  const { data: objects, error: listError } = await admin.storage.from("documents").list(folder, {
    limit: 10, search: "result.pdf"
  });
  const output = objects?.find((item) => item.name === "result.pdf");
  const storedSize = Number(output?.metadata?.size ?? 0);
  const storedMime = String(output?.metadata?.mimetype ?? "");
  if (listError || !output || storedSize !== sizeBytes || storedMime !== "application/pdf") {
    await admin.storage.from("documents").remove([storagePath]);
    return NextResponse.json({ error: "The uploaded private PDF object could not be verified." }, { status: 409 });
  }

  const { data: signedOutput, error: signedOutputError } = await admin.storage.from("documents").createSignedUrl(storagePath, 60);
  if (signedOutputError || !signedOutput?.signedUrl) {
    return NextResponse.json({ error: "Could not verify the stored PDF signature." }, { status: 502 });
  }
  const signatureResponse = await fetch(signedOutput.signedUrl, {
    headers: { Range: "bytes=0-4" }, cache: "no-store", signal: AbortSignal.timeout(10_000)
  }).catch(() => null);
  if (!signatureResponse?.ok || !signatureResponse.body) {
    await admin.storage.from("documents").remove([storagePath]);
    return NextResponse.json({ error: "The uploaded PDF could not be read for validation." }, { status: 415 });
  }
  const reader = signatureResponse.body.getReader();
  const firstChunk = await reader.read().catch(() => ({ done: true, value: undefined }));
  await reader.cancel().catch(() => {});
  if (!firstChunk.value || Buffer.from(firstChunk.value).subarray(0, 5).toString("ascii") !== "%PDF-") {
    await admin.storage.from("documents").remove([storagePath]);
    return NextResponse.json({ error: "The uploaded object does not have a PDF file signature." }, { status: 415 });
  }

  const { data: published, error: publishError } = await admin.rpc("publish_processing_revision", {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_attempt: attempt,
    p_storage_path: storagePath,
    p_size_bytes: sizeBytes
  });
  const revision = Array.isArray(published) ? published[0] : published;
  if (publishError || !revision) {
    return NextResponse.json({ error: "The output could not be atomically published. The private object was retained for safe retry or cleanup." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, revisionId: revision.revision_id, version: revision.revision_version, reused: false }, {
    headers: { "Cache-Control": "no-store" }
  });
}
