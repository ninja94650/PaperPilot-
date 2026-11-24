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
    .select("id,owner_id,document_id,status,worker_id,lease_expires_at,attempt_count")
    .eq("id", jobId).maybeSingle();
  if (jobError) return NextResponse.json({ error: "Could not verify the processing job." }, { status: 500 });
  if (!job || job.status !== "running" || job.worker_id !== workerId || job.attempt_count !== attempt
    || !job.lease_expires_at || new Date(job.lease_expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "The worker lease is no longer valid." }, { status: 409 });
  }
  if (!job.document_id || !storagePath.startsWith(job.owner_id + "/" + job.id + "/")
    || !new RegExp("^" + job.owner_id + "/" + job.id + "/[0-9a-f-]{36}/result\\.pdf$").test(storagePath)) {
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
    return NextResponse.json({ error: "The uploaded private PDF object could not be verified." }, { status: 409 });
  }

  const { data: document, error: documentError } = await admin.from("documents")
    .select("id,owner_id").eq("id", job.document_id).eq("owner_id", job.owner_id).maybeSingle();
  if (documentError || !document) return NextResponse.json({ error: "Source document ownership could not be verified." }, { status: 404 });
  const { data: latest } = await admin.from("document_revisions").select("version")
    .eq("document_id", document.id).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = (latest?.version ?? 0) + 1;

  const { data: revision, error: revisionError } = await admin.from("document_revisions").insert({
    owner_id: job.owner_id, document_id: document.id, processing_job_id: job.id,
    version, storage_path: storagePath, mime_type: "application/pdf", size_bytes: sizeBytes
  }).select("id,version").single();
  if (revisionError || !revision) {
    await admin.storage.from("documents").remove([storagePath]);
    return NextResponse.json({ error: "Could not publish the immutable output revision." }, { status: 500 });
  }

  const { error: pathError } = await admin.from("processing_jobs").update({
    output_storage_path: storagePath,
    output_metadata: { mime_type: "application/pdf", output_size_bytes: sizeBytes, revision_id: revision.id, revision: version }
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
