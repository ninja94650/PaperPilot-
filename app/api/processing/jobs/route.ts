import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const allowedTools = new Set(["office-to-pdf", "pdf-to-image", "image-to-pdf", "ocr", "pdf-compress"]);

export async function POST(request: Request) {
  let supabase;
  try { supabase = await createClient(); }
  catch { return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 }); }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "A JSON request body is required." }, { status: 400 }); }
  const documentId = typeof body.documentId === "string" ? body.documentId : "";
  const tool = typeof body.tool === "string" ? body.tool : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return NextResponse.json({ error: "A valid document ID is required." }, { status: 400 });
  if (!allowedTools.has(tool)) return NextResponse.json({ error: "This processing tool is not supported." }, { status: 400 });
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) return NextResponse.json({ error: "A valid idempotency key (8–128 characters) is required." }, { status: 400 });

  const { data: document, error: documentError } = await supabase.from("documents")
    .select("id,name,mime_type,size_bytes,storage_path,status")
    .eq("id", documentId).eq("owner_id", user.id).single();
  if (documentError || !document) return NextResponse.json({ error: "Document not found in your private library." }, { status: 404 });
  if (document.status === "deleted" || document.size_bytes < 1 || document.size_bytes > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "The selected document is not eligible for processing." }, { status: 415 });
  }

  let admin;
  try { admin = createAdminClient(); }
  catch { return NextResponse.json({ error: "Secure job creation is not configured on this deployment." }, { status: 503 }); }

  const { data: existing } = await admin.from("processing_jobs").select("id,status,progress_percent,created_at")
    .eq("owner_id", user.id).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing) return NextResponse.json({ job: existing, reused: true }, { status: 200 });

  const { data: job, error: insertError } = await admin.from("processing_jobs").insert({
    owner_id: user.id,
    document_id: document.id,
    tool,
    status: "queued",
    scan_status: "pending",
    input_storage_path: document.storage_path,
    input_metadata: { file_name: document.name, mime_type: document.mime_type, size_bytes: document.size_bytes },
    idempotency_key: idempotencyKey,
    max_attempts: 3,
    progress_percent: 0,
    progress_message: "Waiting for security inspection"
  }).select("id,status,progress_percent,created_at").single();

  if (insertError || !job) {
    if (insertError?.code === "23505") {
      const { data: duplicate } = await admin.from("processing_jobs").select("id,status,progress_percent,created_at")
        .eq("owner_id", user.id).eq("idempotency_key", idempotencyKey).maybeSingle();
      if (duplicate) return NextResponse.json({ job: duplicate, reused: true });
    }
    return NextResponse.json({ error: "Could not create a processing job." }, { status: 500 });
  }
  await admin.from("processing_job_events").insert({
    job_id: job.id, owner_id: user.id, event_type: "created", status: "queued",
    progress_percent: 0, message: "Job accepted; awaiting security inspection"
  });
  return NextResponse.json({ job, reused: false }, { status: 202 });
}
