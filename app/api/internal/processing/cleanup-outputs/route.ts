import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedWorker } from "@/lib/processing/worker-auth";
import { classifyOutputForCleanup } from "@/lib/processing/output-cleanup.mjs";

export const runtime = "nodejs";
const leaseGraceMs = 5 * 60 * 1000;

type CleanupJob = {
  id: string;
  owner_id: string;
  status: string;
  worker_id: string | null;
  attempt_count: number;
  lease_expires_at: string | null;
  output_storage_path: string | null;
};

async function cleanupJob(admin: ReturnType<typeof createAdminClient>, job: CleanupJob, nowMs: number) {
  const classification = classifyOutputForCleanup(job, nowMs, leaseGraceMs);
  if (classification.action === "invalid") return "invalid";
  if (classification.action === "keep") return "skipped";

  const { error: removeError } = await admin.storage.from("documents").remove([job.output_storage_path!]);
  if (removeError) return "error";

  let update = admin.from("processing_jobs").update({
    output_storage_path: null,
    output_metadata: {}
  }).eq("id", job.id).eq("owner_id", job.owner_id)
    .eq("output_storage_path", job.output_storage_path);

  if (classification.reason === "prior-attempt") {
    update = update.eq("status", "running")
      .eq("worker_id", job.worker_id)
      .eq("attempt_count", job.attempt_count);
  } else if (classification.reason === "expired-lease") {
    update = update.eq("status", "running")
      .eq("attempt_count", job.attempt_count)
      .lte("lease_expires_at", new Date(nowMs - leaseGraceMs).toISOString());
  } else {
    update = update.in("status", ["queued", "failed", "cancelled"]);
  }

  const { data, error } = await update.select("id").maybeSingle();
  if (error) return "error";
  return data ? "removed" : "skipped";
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedWorker(request)) {
    return NextResponse.json({ error: "Unauthorized worker request." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "A JSON body is required." }, { status: 400 }); }

  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  const workerId = typeof body.workerId === "string" ? body.workerId : "";
  const attempt = Number(body.attempt);
  const limit = Number(body.limit ?? 50);
  if (jobId && (!/^[0-9a-f-]{36}$/i.test(jobId) ||
      !/^[A-Za-z0-9._:-]{3,80}$/.test(workerId) || !Number.isInteger(attempt) || attempt < 1)) {
    return NextResponse.json({ error: "Invalid job-scoped cleanup request." }, { status: 400 });
  }
  if (!jobId && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    return NextResponse.json({ error: "Cleanup batch size must be between 1 and 100." }, { status: 400 });
  }

  let admin;
  try { admin = createAdminClient(); }
  catch { return NextResponse.json({ error: "Worker output cleanup is not configured." }, { status: 503 }); }

  const nowMs = Date.now();
  let candidates: CleanupJob[] = [];
  if (jobId) {
    const { data: job, error } = await admin.from("processing_jobs")
      .select("id,owner_id,status,worker_id,attempt_count,lease_expires_at,output_storage_path")
      .eq("id", jobId).maybeSingle();
    if (error) return NextResponse.json({ error: "Could not read the processing job." }, { status: 500 });
    if (!job) return NextResponse.json({ error: "Processing job not found." }, { status: 404 });
    if (job.status !== "running" || job.worker_id !== workerId || job.attempt_count !== attempt
      || !job.lease_expires_at || new Date(job.lease_expires_at).getTime() <= nowMs) {
      return NextResponse.json({ error: "The active worker lease is no longer valid." }, { status: 409 });
    }
    candidates = [job as CleanupJob];
  } else {
    const cutoff = new Date(nowMs - leaseGraceMs).toISOString();
    const [inactive, expired] = await Promise.all([
      admin.from("processing_jobs")
        .select("id,owner_id,status,worker_id,attempt_count,lease_expires_at,output_storage_path")
        .not("output_storage_path", "is", null)
        .in("status", ["queued", "failed", "cancelled"])
        .order("updated_at", { ascending: true }).limit(limit),
      admin.from("processing_jobs")
        .select("id,owner_id,status,worker_id,attempt_count,lease_expires_at,output_storage_path")
        .not("output_storage_path", "is", null)
        .eq("status", "running").lte("lease_expires_at", cutoff)
        .order("updated_at", { ascending: true }).limit(limit)
    ]);
    if (inactive.error || expired.error) {
      return NextResponse.json({ error: "Could not enumerate orphaned processing outputs." }, { status: 500 });
    }
    const unique = new Map<string, CleanupJob>();
    for (const job of [...(inactive.data ?? []), ...(expired.data ?? [])]) unique.set(job.id, job as CleanupJob);
    candidates = [...unique.values()].slice(0, limit);
  }

  const counts = { removed: 0, skipped: 0, invalid: 0, errors: 0 };
  for (const job of candidates) {
    const result = await cleanupJob(admin, job, nowMs);
    counts[result as keyof typeof counts] += 1;
  }
  return NextResponse.json(counts, { headers: { "Cache-Control": "no-store" } });
}
