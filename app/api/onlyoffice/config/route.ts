import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}
function signJwt(payload: Record<string, unknown>, secret: string) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const input = header + "." + body;
  const signature = createHmac("sha256", secret).update(input).digest("base64url");
  return input + "." + signature;
}

export async function GET(request: Request) {
  const serverUrl = process.env.ONLYOFFICE_DOCUMENT_SERVER_URL?.replace(/\/+$/, "");
  const secret = process.env.ONLYOFFICE_JWT_SECRET;
  if (!serverUrl || !secret) {
    return NextResponse.json({ error: "ONLYOFFICE Docs is not configured for this deployment." }, { status: 503 });
  }

  let supabase;
  try { supabase = await createClient(); }
  catch { return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 }); }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });

  const documentId = new URL(request.url).searchParams.get("documentId");
  if (!documentId) return NextResponse.json({ error: "Document ID is required." }, { status: 400 });
  const { data: row, error } = await supabase.from("documents")
    .select("id,file_name,object_path,mime_type,updated_at")
    .eq("id", documentId).single();
  if (error || !row) return NextResponse.json({ error: "Document not found in your private library." }, { status: 404 });

  const extension = row.file_name.split(".").pop()?.toLowerCase();
  const fileType = extension === "doc" ? "doc" : extension === "docx" ? "docx" : extension === "ppt" ? "ppt" : extension === "pptx" ? "pptx" : null;
  if (!fileType) return NextResponse.json({ error: "ONLYOFFICE editing currently supports DOC, DOCX, PPT and PPTX files." }, { status: 415 });
  const documentType = fileType.startsWith("ppt") ? "slide" : "word";
  const { data: signed, error: signedError } = await supabase.storage.from("paperpilot-documents").createSignedUrl(row.object_path, 300);
  if (signedError || !signed) return NextResponse.json({ error: "Could not create a private document link." }, { status: 500 });

  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") || new URL(request.url).origin;
  const key = row.id.replace(/-/g, "") + "_" + new Date(row.updated_at).getTime();
  const config: Record<string, unknown> = {
    documentType,
    document: {
      fileType,
      key,
      title: row.file_name,
      url: signed.signedUrl,
      permissions: { edit: true, download: true, print: true, review: true }
    },
    editorConfig: {
      mode: "edit",
      callbackUrl: origin + "/api/onlyoffice/callback?documentId=" + encodeURIComponent(row.id),
      user: { id: user.id, name: user.email || "PaperPilot user" },
      customization: { forcesave: true }
    },
    height: "100%",
    width: "100%"
  };
  return NextResponse.json({
    documentServerUrl: serverUrl,
    config: { ...config, token: signJwt(config, secret) }
  }, { headers: { "Cache-Control": "private, no-store" } });
}
