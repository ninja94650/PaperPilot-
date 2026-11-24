import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedWorker } from "@/lib/processing/worker-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAuthorizedWorker(request)) return NextResponse.json({ error: "Unauthorized worker request." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "A JSON body is required." }, { status: 400 }); }
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  const workerId = typeof body.workerId === "string" ? body.workerId : "";
  const attempt = Number(body.attempt);
  const code = typeof body.code === "string" ? body.code.slice(0, 80) : "worker_error";
  const message = typeof body.message === "string" ? body.message.slice(0, 400) : "The worker could not process this document.";
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || !/^[A-Za-z0-9._:-]{3,80}$/.test(workerId) || !Number.isInteger(attempt) || attempt < 1) {
    return NextResponse.json({ error: "Invalid failure report." }, { status: 400 });
  }
  let admin;
  try { admin = createAdminClient(); }
  catch { return NextResponse.json({ error: "Worker queue is not configured." }, { status: 503 }); }
  const { data: current } = await admin.from("processing_jobs").select("owner_id,attempt_count,status,worker_id,output_storage_path")
    .eq("id", jobId).maybeSingle();
  if (!current || current.status !== "running" || current.worker_id !== workerId || current.attempt_count !== attempt) {
    return NextResponse.json({ error: "The worker lease is no longer valid." }, { status: 409 });
  }
  const { data, error } = await admin.rpc("finish_processing_job", {
    p_job_id: jobId, p_worker_id: workerId, p_success: false,
    p_error_code: code, p_error_message: message
  });
  if (error) return NextResponse.json({ error: "Could not finalize the failed attempt." }, { status: 500 });
  const job = Array.isArray(data) ? data[0] : data;
  if (!job) return NextResponse.json({ error: "The worker lease expired before failure was recorded." }, { status: 409 });
  if (current.output_storage_path && current.output_storage_path.startsWith(current.owner_id + "/" + jobId + "/")) {
    await admin.storage.from("documents").remove([current.output_storage_path]);
    await admin.from("processing_jobs").update({ output_storage_path: null, output_metadata: {} })
      .eq("id", jobId).eq("worker_id", null);
  }
  await admin.from("processing_job_events").insert({
    job_id: jobId, owner_id: current.owner_id,
    event_type: job.status === "queued" ? "retry_scheduled" : job.status,
    status: job.status, progress_percent: job.progress_percent,
    message: job.progress_message, details: { error_code: code }
  });
  return NextResponse.json({ ok: true, status: job.status, availableAt: job.available_at }, {
    headers: { "Cache-Control": "no-store" }
  });
}
