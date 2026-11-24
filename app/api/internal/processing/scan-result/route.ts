import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedWorker } from "@/lib/processing/worker-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAuthorizedWorker(request)) return NextResponse.json({ error: "Unauthorized scanner request." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "A JSON body is required." }, { status: 400 }); }
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  const workerId = typeof body.workerId === "string" ? body.workerId : "";
  const attempt = Number(body.attempt);
  const verdict = String(body.verdict ?? "");
  const engine = typeof body.engine === "string" ? body.engine.slice(0, 80) : "";
  const signatureVersion = typeof body.signatureVersion === "string" ? body.signatureVersion.slice(0, 80) : "";
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || !/^[A-Za-z0-9._:-]{3,80}$/.test(workerId)
    || !Number.isInteger(attempt) || attempt < 1 || !["clean", "rejected", "failed"].includes(verdict)
    || !engine || !signatureVersion) {
    return NextResponse.json({ error: "Invalid scan result parameters." }, { status: 400 });
  }
  let admin;
  try { admin = createAdminClient(); }
  catch { return NextResponse.json({ error: "Scanner reporting is not configured." }, { status: 503 }); }

  const { data: current, error: readError } = await admin.from("processing_jobs")
    .select("id,owner_id,status,scan_status,scan_worker_id,scan_attempt_count,scan_lease_expires_at")
    .eq("id", jobId).maybeSingle();
  if (readError) return NextResponse.json({ error: "Could not verify the scan lease." }, { status: 500 });
  if (!current || current.status !== "queued" || current.scan_status !== "pending"
    || current.scan_worker_id !== workerId || current.scan_attempt_count !== attempt
    || !current.scan_lease_expires_at || new Date(current.scan_lease_expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "The scan lease is no longer valid." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const retryScan = verdict === "failed" && attempt < 3;
  const update = verdict === "clean"
    ? { scan_status: "clean", scanned_at: now, scan_engine: engine, scan_signature_version: signatureVersion, scan_worker_id: null, scan_lease_expires_at: null, progress_message: "Security inspection passed", updated_at: now }
    : retryScan
      ? { scan_available_at: new Date(Date.now() + 60_000 * attempt).toISOString(), scan_worker_id: null, scan_lease_expires_at: null, scan_engine: engine, scan_signature_version: signatureVersion, progress_message: "Security inspection will retry", updated_at: now }
      : { scan_status: verdict === "rejected" ? "rejected" : "failed", scanned_at: now, scan_engine: engine, scan_signature_version: signatureVersion, scan_worker_id: null, scan_lease_expires_at: null, status: "failed", completed_at: now, error_message: verdict === "rejected" ? "The uploaded document failed security inspection." : "Security inspection could not be completed.", last_error_code: "scan_" + verdict, updated_at: now };
  const { data: job, error } = await admin.from("processing_jobs").update(update)
    .eq("id", jobId).eq("scan_worker_id", workerId).eq("scan_attempt_count", attempt)
    .gt("scan_lease_expires_at", now)
    .select("id,owner_id,status,scan_status,progress_message").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not record the security inspection result." }, { status: 500 });
  if (!job) return NextResponse.json({ error: "The scan lease changed before the result was recorded." }, { status: 409 });
  await admin.from("processing_job_events").insert({
    job_id: job.id, owner_id: job.owner_id, event_type: retryScan ? "security_scan_retry" : "security_scan_" + verdict,
    status: job.status, progress_percent: 0,
    message: verdict === "clean" ? "Security inspection passed" : verdict === "rejected" ? "Document rejected by security inspection" : "Security inspection failed",
    details: { engine, signature_version: signatureVersion, attempt }
  });
  return NextResponse.json({ ok: true, scanStatus: job.scan_status, retryScheduled: retryScan }, {
    headers: { "Cache-Control": "no-store" }
  });
}
