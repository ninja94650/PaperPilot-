import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateOOXMLArchive } from "../../../../worker/archive-validation.mjs";
import { consumeProcessingRateLimit } from "@/lib/processing/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 20 * 1024 * 1024;
const WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function validName(name: unknown, kind: unknown): name is string {
  if (typeof name !== "string" || name.length < 5 || name.length > 120) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(name)) return false;
  return kind === "word" ? name.toLowerCase().endsWith(".docx")
    : kind === "presentation" ? name.toLowerCase().endsWith(".pptx") : false;
}

export async function GET(request: Request) {
  let supabase;
  try { supabase = await createClient(); }
  catch { return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 }); }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });

  const url = new URL(request.url);
  const revisionId = url.searchParams.get("revisionId");
  if (revisionId) {
    if (!UUID.test(revisionId)) return NextResponse.json({ error: "A valid revision ID is required." }, { status: 400 });
    const admin = createAdminClient();
    const { data: pending, error: pendingError } = await admin.from("editor_revision_scan_jobs")
      .select("status,error_code").eq("revision_id", revisionId).eq("owner_id", user.id).maybeSingle();
    if (pendingError) return NextResponse.json({ error: "Could not read revision scan status." }, { status: 500 });
    if (pending) return NextResponse.json({ scanStatus: pending.status, errorCode: pending.error_code }, { headers: { "Cache-Control": "private, no-store" } });
    const { data: published } = await supabase.from("editor_revisions").select("id,version").eq("id", revisionId).maybeSingle();
    return published ? NextResponse.json({ scanStatus: "clean", revision: published }, { headers: { "Cache-Control": "private, no-store" } })
      : NextResponse.json({ error: "Revision not found." }, { status: 404 });
  }
  const documentId = url.searchParams.get("documentId") || "";
  if (!UUID.test(documentId)) return NextResponse.json({ error: "A valid document ID is required." }, { status: 400 });

  const { data, error } = await supabase.from("editor_revisions")
    .select("id,document_id,version,parent_revision_id,name,mime_type,editor_kind,size_bytes,sha256,created_at")
    .eq("document_id", documentId)
    .order("version", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: "Could not load revision history." }, { status: 500 });
  return NextResponse.json({ revisions: data ?? [] }, {
    headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" }
  });
}

export async function POST(request: Request) {
  let supabase;
  try { supabase = await createClient(); }
  catch { return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 }); }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  try {
    const limit = await consumeProcessingRateLimit(supabase, "editor:revision");
    if (!limit.allowed) return NextResponse.json({ error: "Office cloud autosave is rate limited. Please wait before retrying." }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds), "Cache-Control": "no-store" }
    });
  } catch {
    return NextResponse.json({ error: "Office revision rate limiting is temporarily unavailable." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "A JSON request body is required." }, { status: 400 }); }

  const documentId = typeof body.documentId === "string" ? body.documentId : "";
  const revisionId = typeof body.revisionId === "string" ? body.revisionId : "";
  const parentRevisionId = body.parentRevisionId === null || body.parentRevisionId === undefined
    ? null : typeof body.parentRevisionId === "string" ? body.parentRevisionId : "invalid";
  const editorKind = body.editorKind === "word" || body.editorKind === "presentation" ? body.editorKind : "";
  const name = body.name;
  const mimeType = editorKind === "word" ? WORD_MIME : editorKind === "presentation" ? PPTX_MIME : "";
  const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";

  if (!UUID.test(documentId) || !UUID.test(revisionId) ||
      (parentRevisionId !== null && !UUID.test(parentRevisionId)) ||
      !validName(name, editorKind) || !mimeType) {
    return NextResponse.json({ error: "Office revision metadata is invalid." }, { status: 400 });
  }
  const expectedPath = user.id + "/" + documentId + "/editor/" + revisionId + "/" + name;
  if (storagePath !== expectedPath) return NextResponse.json({ error: "Revision storage path is invalid." }, { status: 400 });

  let admin;
  try { admin = createAdminClient(); }
  catch { return NextResponse.json({ error: "Secure revision storage is not configured." }, { status: 503 }); }

  const { data: source, error: sourceError } = await admin.from("documents")
    .select("id,owner_id,status,mime_type")
    .eq("id", documentId).eq("owner_id", user.id).maybeSingle();
  if (sourceError || !source || source.status === "deleted") {
    return NextResponse.json({ error: "Source document not found in your private library." }, { status: 404 });
  }
  const wordSources = new Set([
    WORD_MIME, "application/msword", "application/rtf", "text/rtf",
    "application/vnd.oasis.opendocument.text"
  ]);
  const presentationSources = new Set([
    PPTX_MIME, "application/vnd.ms-powerpoint",
    "application/vnd.oasis.opendocument.presentation"
  ]);
  if (editorKind === "word" ? !wordSources.has(source.mime_type) : !presentationSources.has(source.mime_type)) {
    return NextResponse.json({ error: "The source document format does not match this editor." }, { status: 409 });
  }

  const { data: object, error: downloadError } = await admin.storage.from("documents").download(storagePath);
  if (downloadError || !object) return NextResponse.json({ error: "Uploaded revision object was not found." }, { status: 404 });

  const bytes = Buffer.from(await object.arrayBuffer());
  if (bytes.length < 1 || bytes.length > MAX_BYTES) {
    await admin.storage.from("documents").remove([storagePath]);
    return NextResponse.json({ error: "Office revision exceeds the allowed file size." }, { status: 413 });
  }

  try {
    validateOOXMLArchive(bytes, editorKind === "word" ? "word/document.xml" : "ppt/presentation.xml");
  } catch {
    await admin.storage.from("documents").remove([storagePath]);
    return NextResponse.json({ error: "The saved Office package failed structural security validation." }, { status: 422 });
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { error: queueError } = await admin.from("editor_revision_scan_jobs").insert({
    id: revisionId, owner_id: user.id, document_id: documentId, revision_id: revisionId,
    parent_revision_id: parentRevisionId, storage_path: storagePath, name, mime_type: mimeType,
    editor_kind: editorKind, size_bytes: bytes.length, sha256, status: "queued"
  });
  if (queueError) {
    await admin.storage.from("documents").remove([storagePath]);
    return NextResponse.json({ error: "Could not queue this Office revision for malware inspection." }, { status: 409 });
  }
  return NextResponse.json({
    revision: { id: revisionId, documentId, parentRevisionId, name, mimeType, editorKind, sizeBytes: bytes.length, sha256 },
    scanStatus: "queued"
  }, { status: 202, headers: { "Cache-Control": "private, no-store", "Retry-After": "3" } });
}
