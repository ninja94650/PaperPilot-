import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function verifyJwt(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const input = parts[0] + "." + parts[1];
  const expected = createHmac("sha256", secret).update(input).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(parts[2], "base64url"); } catch { return null; }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try { return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>; }
  catch { return null; }
}

export async function POST(request: Request) {
  const secret = process.env.ONLYOFFICE_JWT_SECRET;
  const serverUrl = process.env.ONLYOFFICE_DOCUMENT_SERVER_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !serverUrl || !supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 1, message: "ONLYOFFICE callback storage is not configured." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 1 }, { status: 400 }); }
  const authorization = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const token = authorization || (typeof body.token === "string" ? body.token : "");
  const claims = token ? verifyJwt(token, secret) : null;
  if (!claims) return NextResponse.json({ error: 1, message: "Invalid editor callback signature." }, { status: 401 });

  const documentId = new URL(request.url).searchParams.get("documentId");
  const key = typeof claims.key === "string" ? claims.key : "";
  if (!documentId || !key.startsWith(documentId.replace(/-/g, "") + "_")) {
    return NextResponse.json({ error: 1, message: "Callback document does not match the signed editor key." }, { status: 403 });
  }

  const status = Number(claims.status);
  if (status !== 2 && status !== 6) return NextResponse.json({ error: 0 });
  const downloadUrl = typeof claims.url === "string" ? claims.url : "";
  let parsedDownload: URL;
  try { parsedDownload = new URL(downloadUrl); } catch { return NextResponse.json({ error: 1 }, { status: 400 }); }
  const expectedHost = new URL(serverUrl).host;
  if (parsedDownload.protocol !== "https:" || parsedDownload.host !== expectedHost) {
    return NextResponse.json({ error: 1, message: "Editor save URL did not match the configured document server." }, { status: 403 });
  }

  let downloaded: Response;
  try {
    downloaded = await fetch(parsedDownload, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  } catch {
    return NextResponse.json({ error: 1, message: "Could not retrieve the saved document from ONLYOFFICE." }, { status: 502 });
  }
  if (!downloaded.ok) return NextResponse.json({ error: 1 }, { status: 502 });
  const bytes = await downloaded.arrayBuffer();
  if (bytes.byteLength < 8 || bytes.byteLength > 20 * 1024 * 1024) return NextResponse.json({ error: 1, message: "Saved document size is invalid." }, { status: 413 });
  const signature = new Uint8Array(bytes.slice(0, 8));
  const zip = signature[0] === 0x50 && signature[1] === 0x4b;
  const ole = signature[0] === 0xd0 && signature[1] === 0xcf && signature[2] === 0x11 && signature[3] === 0xe0;
  if (!zip && !ole) return NextResponse.json({ error: 1, message: "Saved Office file signature was invalid." }, { status: 415 });

  const admin = createAdminClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: row, error: rowError } = await admin.from("documents").select("id,object_path,mime_type").eq("id", documentId).single();
  if (rowError || !row) return NextResponse.json({ error: 1 }, { status: 404 });
  const { error: uploadError } = await admin.storage.from("paperpilot-documents").upload(row.object_path, bytes, {
    upsert: true,
    contentType: row.mime_type || "application/octet-stream"
  });
  if (uploadError) return NextResponse.json({ error: 1, message: "Could not save the edited document." }, { status: 500 });
  const { error: updateError } = await admin.from("documents").update({ file_size: bytes.byteLength }).eq("id", documentId);
  if (updateError) return NextResponse.json({ error: 1 }, { status: 500 });
  return NextResponse.json({ error: 0 });
}
