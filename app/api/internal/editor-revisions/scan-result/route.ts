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
  const signatureVersion = typeof body.signatureVersion === "string" ? body.signatureVersion.slice(0, 120) : "";
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || !/^[A-Za-z0-9._:-]{3,80}$/.test(workerId)
      || !Number.isInteger(attempt) || attempt < 1 || !["clean", "rejected", "failed"].includes(verdict) || !signatureVersion) {
    return NextResponse.json({ error: "Invalid Office scan result." }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: job, error } = await admin.from("editor_revision_scan_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not verify Office scan lease." }, { status: 500 });
  if (!job || job.status !== "scanning" || job.worker_id !== workerId || job.attempt_count !== attempt
      || !job.lease_expires_at || new Date(job.lease_expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Office scan lease expired or changed." }, { status: 409 });
  }

  if (verdict === "clean") {
    const { data: published, error: publishError } = await admin.rpc("publish_editor_revision", {
      p_owner_id: job.owner_id, p_document_id: job.document_id, p_revision_id: job.revision_id,
      p_parent_revision_id: job.parent_revision_id, p_storage_path: job.storage_path,
      p_name: job.name, p_mime_type: job.mime_type, p_editor_kind: job.editor_kind,
      p_size_bytes: job.size_bytes, p_sha256: job.sha256
    });
    const revision = Array.isArray(published) ? published[0] : published;
    if (publishError || !revision) {
      await admin.from("editor_revision_scan_jobs").update({
        status: "queued", worker_id: null, lease_expires_at: null,
        available_at: new Date(Date.now() + 60_000).toISOString(), error_code: "publish_failed", updated_at: new Date().toISOString()
      }).eq("id", job.id).eq("worker_id", workerId).eq("attempt_count", attempt);
      return NextResponse.json({ error: "Clean scan could not be published; the revision remains quarantined for retry." }, { status: 503 });
    }
    const { error: updateError } = await admin.from("editor_revision_scan_jobs").update({
      status: "clean", worker_id: null, lease_expires_at: null, signature_version: signatureVersion,
      error_code: null, updated_at: new Date().toISOString()
    }).eq("id", job.id).eq("worker_id", workerId).eq("attempt_count", attempt).eq("status", "scanning");
    if (updateError) return NextResponse.json({ error: "Revision published but scan status could not be finalized." }, { status: 503 });
    return NextResponse.json({ ok: true, scanStatus: "clean", revisionId: revision.revision_id, version: revision.revision_version });
  }

  const rejected = verdict === "rejected";
  const retry = !rejected && attempt < 3;
  const now = new Date().toISOString();
  const update = retry
    ? { status: "queued", worker_id: null, lease_expires_at: null, available_at: new Date(Date.now() + attempt * 60_000).toISOString(), signature_version: signatureVersion, error_code: "scanner_unavailable", updated_at: now }
    : { status: rejected ? "rejected" : "failed", worker_id: null, lease_expires_at: null, signature_version: signatureVersion, error_code: rejected ? "malware_detected" : "scanner_unavailable", updated_at: now };
  const { error: updateError } = await admin.from("editor_revision_scan_jobs").update(update)
    .eq("id", job.id).eq("worker_id", workerId).eq("attempt_count", attempt).eq("status", "scanning");
  if (updateError) return NextResponse.json({ error: "Could not record Office scan verdict." }, { status: 500 });
  if (!retry) await admin.storage.from("documents").remove([job.storage_path]);
  return NextResponse.json({ ok: true, scanStatus: update.status, retryScheduled: retry }, { headers: { "Cache-Control": "no-store" } });
}
