import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORD = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  let supabase;
  try { supabase = await createClient(); }
  catch { return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 }); }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Cloud document not found." }, { status: 404 });

  const { data: document, error } = await supabase.from("documents")
    .select("id,owner_id,name,mime_type,size_bytes,storage_path,status")
    .eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (error || !document || document.status === "deleted") return NextResponse.json({ error: "Cloud document not found." }, { status: 404 });

  const kind = document.mime_type === WORD ? "word" : document.mime_type === PPTX ? "presentation" : null;
  if (!kind) return NextResponse.json({ error: "This cloud document is not currently supported by Office Studio. Download it or use its format-specific workflow." }, { status: 415 });

  const admin = createAdminClient();
  const { data: latest, error: revisionError } = await admin.from("editor_revisions")
    .select("id,version,name,mime_type,storage_path,editor_kind")
    .eq("document_id", id).eq("owner_id", user.id).order("version", { ascending: false }).limit(1).maybeSingle();
  if (revisionError) return NextResponse.json({ error: "Could not load the latest clean Office revision." }, { status: 500 });

  const sourceSigned = await admin.storage.from("documents").createSignedUrl(document.storage_path, 60);
  if (sourceSigned.error || !sourceSigned.data?.signedUrl) return NextResponse.json({ error: "Could not prepare the private source document." }, { status: 502 });
  const currentPath = latest?.storage_path || document.storage_path;
  const currentSigned = latest
    ? await admin.storage.from("documents").createSignedUrl(currentPath, 60)
    : sourceSigned;
  if (currentSigned.error || !currentSigned.data?.signedUrl) return NextResponse.json({ error: "Could not prepare the latest clean Office revision." }, { status: 502 });

  return NextResponse.json({
    documentId: id,
    kind,
    source: { url: sourceSigned.data.signedUrl, name: document.name, mimeType: document.mime_type },
    current: { url: currentSigned.data.signedUrl, name: latest?.name || document.name, mimeType: latest?.mime_type || document.mime_type },
    parentRevisionId: latest?.id || null,
    version: latest?.version || 0
  }, { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
}
