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
  const verdict = body.verdict;
  const engine = typeof body.engine === "string" ? body.engine.slice(0, 80) : "";
  const signatureVersion = typeof body.signatureVersion === "string" ? body.signatureVersion.slice(0, 80) : "";
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || !["clean", "rejected", "failed"].includes(String(verdict)) || !engine || !signatureVersion) {
    return NextResponse.json({ error: "A job ID, supported verdict, engine and signature version are required." }, { status: 400 });
  }
  let admin;
  try { admin = createAdminClient(); }
  catch { return NextResponse.json({ error: "Scanner reporting is not configured." }, { status: 503 }); }
  const now = new Date().toISOString();
  const scanStatus = String(verdict);
  const update = scanStatus === "clean"
    ? { scan_status: "clean", scanned_at: now, scan_engine: engine, scan_signature_version: signatureVersion, progress_message: "Security inspection passed", updated_at: now }
    : { scan_status: scanStatus, scanned_at: now, scan_engine: engine, scan_signature_version: signatureVersion, status: "failed", completed_at: now, error_message: scanStatus === "rejected" ? "The uploaded document failed security inspection." : "Security inspection could not be completed.", last_error_code: "scan_" + scanStatus, updated_at: now };
  const { data: job, error } = await admin.from("processing_jobs").update(update)
    .eq("id", jobId).eq("status", "queued").eq("scan_status", "pending")
    .select("id,owner_id,status,scan_status,progress_message").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not record the security inspection result." }, { status: 500 });
  if (!job) return NextResponse.json({ error: "The job is not awaiting security inspection." }, { status: 409 });
  await admin.from("processing_job_events").insert({
    job_id: job.id, owner_id: job.owner_id, event_type: "security_scan_" + scanStatus,
    status: job.status, progress_percent: 0,
    message: scanStatus === "clean" ? "Security inspection passed" : "Document rejected by security inspection",
    details: { engine, signature_version: signatureVersion }
  });
  return NextResponse.json({ ok: true, scanStatus: job.scan_status }, {
    headers: { "Cache-Control": "no-store" }
  });
}
