import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedWorker } from "@/lib/processing/worker-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAuthorizedWorker(request)) return NextResponse.json({ error: "Unauthorized scanner request." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "A JSON body is required." }, { status: 400 }); }
  const workerId = typeof body.workerId === "string" ? body.workerId : "";
  if (!/^[A-Za-z0-9._:-]{3,80}$/.test(workerId)) return NextResponse.json({ error: "A valid worker ID is required." }, { status: 400 });
  let admin;
  try { admin = createAdminClient(); }
  catch { return NextResponse.json({ error: "Scanner queue is not configured." }, { status: 503 }); }
  const { data, error } = await admin.rpc("claim_processing_scan_job", { p_worker_id: workerId, p_lease_seconds: 120 });
  if (error) return NextResponse.json({ error: "Could not claim a scan job." }, { status: 500 });
  const job = Array.isArray(data) ? data[0] : data;
  if (!job) return NextResponse.json({ job: null }, { headers: { "Cache-Control": "no-store" } });
  if (!job.input_storage_path || !job.owner_id || !job.input_storage_path.startsWith(job.owner_id + "/")) return NextResponse.json({ error: "The scan job has no valid owner-scoped input object." }, { status: 500 });
  const { data: signed, error: signedError } = await admin.storage.from("documents").createSignedUrl(job.input_storage_path, 120);
  if (signedError || !signed?.signedUrl) return NextResponse.json({ error: "Could not sign the quarantined input." }, { status: 502 });
  return NextResponse.json({
    job: { id: job.id, workerId, attempt: job.scan_attempt_count, inputUrl: signed.signedUrl }
  }, { headers: { "Cache-Control": "no-store" } });
}
