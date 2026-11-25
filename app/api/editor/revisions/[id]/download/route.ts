import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  let supabase;
  try { supabase = await createClient(); }
  catch { return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 }); }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });

  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Revision not found." }, { status: 404 });
  }
  const { data: revision, error } = await supabase.from("editor_revisions")
    .select("storage_path,name,mime_type")
    .eq("id", id)
    .maybeSingle();
  if (error || !revision) return NextResponse.json({ error: "Revision not found." }, { status: 404 });

  const { data: signed, error: signedError } = await supabase.storage.from("documents")
    .createSignedUrl(revision.storage_path, 60, { download: revision.name });
  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not prepare a private revision download." }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" }
  });
}
