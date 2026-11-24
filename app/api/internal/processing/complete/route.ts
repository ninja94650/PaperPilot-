import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedWorker } from "@/lib/processing/worker-auth";

export const runtime = "nodejs";
const maxOutputBytes = 40 * 1024 * 1024;

export async function POST(request: NextRequest) {
  if (!isAuthorizedWorker(request)) return NextResponse.json({ error: "Unauthorized worker request." }, { status: 401 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "A multipart result is required." }, { status: 400 });
  const jobId = String(form.get("jobId") ?? "");
  const workerId = String(form.get("workerId") ?? "");
  const file = form.get("file");
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || !/^[A-Za-z0-9._:-]{3,80}$/.test(workerId) || !(file instanceof File)) {
    return NextResponse.json({ error: "Invalid completion payload." }, { status: 400 });
  }
  if (file.size < 5 || file.size > maxOutputBytes) return NextResponse.json({ error: "The output must be between 5 bytes and 40 MB." }, { status: 413 });
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") return NextResponse.json({ error: "The worker output is not a PDF." }, { status: 415 });

  let admin;
  try { admin = createAdminClient(); }
  catch { return NextResponse.json({ error: "Worker queue is not configured." }, { status: 503 }); }
  const { data: job, error: jobError } = await admin.from("processing_jobs")
    .select("id,owner_id,document_id,status,worker_id,lease_expires_at,attempt_count")
    .eq("id", jobId).maybeSingle();
  if (jobError) return NextResponse.json({ error: "Could not verify the processing job." }, { status: 500 });
  if (!job || job.status !== "running" || job.worker_id !== workerId || !job.lease_expires_at || new Date(job.lease_expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "The worker lease is no longer valid." }, { status: 409 });
  }
  if (!job.document_id) return NextResponse.json({ error: "The job has no source document." }, { status: 409 });
  if (job.attempt_count !== Number(form.get("attempt"))) return NextResponse.json({ error: "The worker attempt does not match the active lease." }, { status: 409 });

  const { data: document, error: documentError } = await admin.from("documents")
    .select("id,owner_id,name").eq("id", job.document_id).eq("owner_id", job.owner_id).maybeSingle();
  if (documentError || !document) return NextResponse.json({ error: "Source document ownership could not be verified." }, { status: 404 });
  const { data: latest } = await admin.from("document_revisions").select("version")
    .eq("document_id", document.id).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = (latest?.version ?? 0) + 1;
  const storagePath = job.owner_id + "/" + job.id + "/" + randomUUID() + "/result.pdf";

  const { error: uploadError } = await admin.storage.from("documents").upload(storagePath, bytes, {
    contentType: "application/pdf", upsert: false
  });
  if (uploadError) return NextResponse.json({ error: "Could not store the private processing output." }, { status: 500 });

  const { data: revision, error: revisionError } = await admin.from("document_revisions").insert({
    owner_id: job.owner_id, document_id: document.id, processing_job_id: job.id,
    version, storage_path: storagePath, mime_type: "application/pdf", size_bytes: bytes.byteLength
  }).select("id,version").single();
  if (revisionError || !revision) {
    await admin.storage.from("documents").remove([storagePath]);
    return NextResponse.json({ error: "Could not publish the immutable output revision." }, { status: 500 });
  }

  const { error: pathError } = await admin.from("processing_jobs").update({
    output_storage_path: storagePath,
    output_metadata: { mime_type: "application/pdf", output_size_bytes: bytes.byteLength, revision_id: revision.id, revision: version }
  }).eq("id", job.id).eq("status", "running").eq("worker_id", workerId);
  if (pathError) {
    await admin.from("document_revisions").delete().eq("id", revision.id);
    await admin.storage.from("documents").remove([storagePath]);
    return NextResponse.json({ error: "Could not attach the output to its processing job." }, { status: 409 });
  }

  const { data: finished, error: finishError } = await admin.rpc("finish_processing_job", {
    p_job_id: job.id, p_worker_id: workerId, p_success: true,
    p_error_code: null, p_error_message: null
  });
  const finalJob = Array.isArray(finished) ? finished[0] : finished;
  if (finishError || !finalJob || finalJob.status !== "succeeded") {
    await admin.from("document_revisions").delete().eq("id", revision.id);
    await admin.storage.from("documents").remove([storagePath]);
    await admin.from("processing_jobs").update({ output_storage_path: null, output_metadata: {} }).eq("id", job.id);
    return NextResponse.json({ error: "The job could not be finalized; its temporary output was discarded." }, { status: 409 });
  }

  await admin.from("documents").update({ status: "ready", updated_at: new Date().toISOString() })
    .eq("id", document.id).eq("owner_id", job.owner_id);
  await admin.from("processing_job_events").insert({
    job_id: job.id, owner_id: job.owner_id, event_type: "completed",
    status: "succeeded", progress_percent: 100, message: "Output revision " + version + " published"
  });
  return NextResponse.json({ ok: true, revisionId: revision.id, version }, {
    headers: { "Cache-Control": "no-store" }
  });
}
