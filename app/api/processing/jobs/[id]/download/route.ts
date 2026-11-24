import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { selectOwnedRecord } from "@/lib/processing/owned-query.mjs";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  let supabase;
  try { supabase = await createClient(); }
  catch { return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 }); }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const { id } = await context.params;
  const { data: job } = await selectOwnedRecord(
    supabase, "processing_jobs", "id,status,document_id", id, user.id
  );
  if (!job) return NextResponse.json({ error: "Processing job not found." }, { status: 404 });
  if (job.status !== "succeeded") return NextResponse.json({ error: "The output is not ready yet." }, { status: 409 });
  const { data: revision, error } = await selectOwnedRecord(
    supabase, "document_revisions", "storage_path,mime_type,version", id, user.id, "processing_job_id"
  );
  if (error || !revision) return NextResponse.json({ error: "The output revision is not available." }, { status: 404 });
  const { data: signed, error: signedError } = await supabase.storage.from("documents").createSignedUrl(revision.storage_path, 60);
  if (signedError || !signed?.signedUrl) return NextResponse.json({ error: "Could not create a private download link." }, { status: 500 });
  return NextResponse.json({ url: signed.signedUrl, mimeType: revision.mime_type, version: revision.version }, {
    headers: { "Cache-Control": "private, no-store" }
  });
}
