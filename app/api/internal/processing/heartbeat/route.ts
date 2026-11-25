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
  const progress = Number(body.progressPercent ?? 50);
  const message = typeof body.message === "string" ? body.message.slice(0, 160) : "Processing";
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || !/^[A-Za-z0-9._:-]{3,80}$/.test(workerId) || !Number.isInteger(progress) || progress < 0 || progress > 99) {
    return NextResponse.json({ error: "Invalid heartbeat parameters." }, { status: 400 });
  }
  let admin;
  try { admin = createAdminClient(); }
  catch { return NextResponse.json({ error: "Worker queue is not configured." }, { status: 503 }); }
  const { data, error } = await admin.rpc("heartbeat_processing_job", {
    p_job_id: jobId, p_worker_id: workerId, p_lease_seconds: 180,
    p_progress_percent: progress, p_progress_message: message
  });
  if (error) return NextResponse.json({ error: "Could not update the worker lease." }, { status: 500 });
  const job = Array.isArray(data) ? data[0] : data;
  if (!job) return NextResponse.json({ error: "Worker lease is no longer valid." }, { status: 409 });
  return NextResponse.json({ ok: true, cancelRequested: Boolean(job.cancel_requested_at), leaseExpiresAt: job.lease_expires_at }, {
    headers: { "Cache-Control": "no-store" }
  });
}
