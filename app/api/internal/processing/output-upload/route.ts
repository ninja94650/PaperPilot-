import { randomUUID } from "node:crypto";
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
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || !/^[A-Za-z0-9._:-]{3,80}$/.test(workerId) || !Number.isInteger(attempt) || attempt < 1) {
    return NextResponse.json({ error: "Invalid output upload request." }, { status: 400 });
  }
  let admin;
  try { admin = createAdminClient(); }
  catch { return NextResponse.json({ error: "Worker output storage is not configured." }, { status: 503 }); }
  const { data: job, error } = await admin.from("processing_jobs")
    .select("id,owner_id,status,worker_id,attempt_count,lease_expires_at")
    .eq("id", jobId).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not verify the active job." }, { status: 500 });
  if (!job || job.status !== "running" || job.worker_id !== workerId || job.attempt_count !== attempt
    || !job.lease_expires_at || new Date(job.lease_expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "The processing lease is no longer valid." }, { status: 409 });
  }
  const storagePath = job.owner_id + "/" + job.id + "/" + randomUUID() + "/result.pdf";
  const { data, error: signError } = await admin.storage.from("documents").createSignedUploadUrl(storagePath, { upsert: false });
  if (signError || !data?.token || !data.signedUrl) {
    return NextResponse.json({ error: "Could not create a one-object private upload token." }, { status: 500 });
  }
  return NextResponse.json({ storagePath, token: data.token, signedUrl: data.signedUrl }, {
    headers: { "Cache-Control": "no-store" }
  });
}
