import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedWorker } from "@/lib/processing/worker-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAuthorizedWorker(request)) return NextResponse.json({ error: "Unauthorized worker request." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "A JSON body is required." }, { status: 400 }); }
  const workerId = typeof body.workerId === "string" ? body.workerId : "";
  if (!/^[A-Za-z0-9._:-]{3,80}$/.test(workerId)) return NextResponse.json({ error: "A valid worker ID is required." }, { status: 400 });

  let admin;
  try { admin = createAdminClient(); }
  catch { return NextResponse.json({ error: "Worker queue is not configured." }, { status: 503 }); }
  const { data, error } = await admin.rpc("claim_processing_job", {
    p_worker_id: workerId, p_lease_seconds: 180
  });
  if (error) return NextResponse.json({ error: "Could not claim a processing job." }, { status: 500 });
  const job = Array.isArray(data) ? data[0] : data;
  if (!job) return NextResponse.json({ job: null }, { status: 200, headers: { "Cache-Control": "no-store" } });
  if (!job.input_storage_path || !job.owner_id || !job.input_storage_path.startsWith(job.owner_id + "/")) {
    await admin.rpc("finish_processing_job", {
      p_job_id: job.id, p_worker_id: workerId, p_success: false,
      p_error_code: "missing_input", p_error_message: "The queued job has no input object."
    });
    return NextResponse.json({ error: "The claimed job has no valid input object." }, { status: 500 });
  }

  const { data: signed, error: signedError } = await admin.storage.from("documents")
    .createSignedUrl(job.input_storage_path, 120);
  if (signedError || !signed?.signedUrl) {
    await admin.rpc("finish_processing_job", {
      p_job_id: job.id, p_worker_id: workerId, p_success: false,
      p_error_code: "input_unavailable", p_error_message: "The private input object could not be retrieved."
    });
    return NextResponse.json({ error: "Could not create a short-lived input URL." }, { status: 502 });
  }
  await admin.from("processing_job_events").insert({
    job_id: job.id, owner_id: job.owner_id, event_type: "claimed",
    status: "running", progress_percent: job.progress_percent, message: "Worker claimed processing job"
  });
  return NextResponse.json({
    job: {
      id: job.id, ownerId: job.owner_id, documentId: job.document_id,
      tool: job.tool, attempt: job.attempt_count, input: job.input_metadata,
      inputUrl: signed.signedUrl
    }
  }, { headers: { "Cache-Control": "no-store" } });
}
