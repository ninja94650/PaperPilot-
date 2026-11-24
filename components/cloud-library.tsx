"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ArrowDownToLine, CloudUpload, FileText, LoaderCircle, Trash2 } from "lucide-react";
import OnlyOfficeLauncher from "@/components/onlyoffice-launcher";

type DocumentRow = { id: string; name: string; storage_path: string; mime_type: string; size_bytes: number; status: string; created_at: string };
const bucket = "documents";

function detectedMime(file: File) {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp"
  };
  return types[extension || ""] || "application/octet-stream";
}

function uploadWithProgress(file: File, path: string, accessToken: string, onProgress: (value: number) => void) {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!projectUrl || !publishableKey) return Promise.reject(new Error("Supabase is not configured."));
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", projectUrl.replace(/\/+$/, "") + "/storage/v1/object/" + bucket + "/" + encodedPath);
    xhr.setRequestHeader("apikey", publishableKey);
    xhr.setRequestHeader("Authorization", "Bearer " + accessToken);
    xhr.setRequestHeader("Content-Type", detectedMime(file));
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let message = "Cloud upload failed.";
        try { const payload = JSON.parse(xhr.responseText); message = payload.message || payload.error || message; } catch {}
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error("The cloud storage connection failed."));
    xhr.ontimeout = () => reject(new Error("Cloud upload timed out. Try again."));
    xhr.timeout = 120_000;
    xhr.send(file);
  });
}

export default function CloudLibrary({ initialDocuments }: { initialDocuments: DocumentRow[] }) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  async function upload(file?: File) {
    if (!file || busy) return;
    if (file.size < 1 || file.size > 20 * 1024 * 1024) { setNotice("Files must be between 1 byte and 20 MB."); return; }
    if (!/\.(pdf|doc|docx|ppt|pptx|jpg|jpeg|png|webp)$/i.test(file.name)) { setNotice("Choose a PDF, Office document, JPG, PNG or WebP file."); return; }
    setBusy(true); setNotice("");
    const supabase = createClient();
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Your session has expired. Sign in again.");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "document";
      const path = user.id + "/" + crypto.randomUUID() + "/" + safeName;
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) throw new Error("Your session has expired. Sign in again.");
      setProgress(0);
      await uploadWithProgress(file, path, sessionData.session.access_token, setProgress);
      const mimeType = detectedMime(file);
      const { data, error: insertError } = await supabase.from("documents").insert({
        owner_id: user.id,
        name: file.name,
        storage_path: path,
        mime_type: mimeType,
        size_bytes: file.size,
        status: "uploaded"
      }).select("id,name,storage_path,mime_type,size_bytes,status,created_at").single();
      if (insertError) {
        await supabase.storage.from(bucket).remove([path]);
        throw insertError;
      }
      setDocuments((current) => [data as DocumentRow, ...current]);
      setNotice("Uploaded securely to your private library.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Upload failed.");
    } finally { setBusy(false); setProgress(null); }
  }

  async function download(row: DocumentRow) {
    setBusy(true); setNotice("");
    try {
      const { data, error } = await createClient().storage.from(bucket).createSignedUrl(row.storage_path, 60);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Download failed."); }
    finally { setBusy(false); }
  }

  async function remove(row: DocumentRow) {
    if (!window.confirm("Permanently delete " + row.name + " from your cloud library?")) return;
    setBusy(true); setNotice("");
    try {
      const supabase = createClient();
      const { error: storageError } = await supabase.storage.from(bucket).remove([row.storage_path]);
      if (storageError) throw storageError;
      const { error } = await supabase.from("documents").delete().eq("id", row.id);
      if (error) throw error;
      setDocuments((current) => current.filter((item) => item.id !== row.id));
      setNotice("Document deleted.");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Delete failed."); }
    finally { setBusy(false); }
  }

  return <section className="cloud-library">
    <div className="cloud-library-head"><div><h2>Cloud library</h2><p>Private files saved to your account. 20 MB per file.</p></div><label className="cloud-upload-button"><CloudUpload size={16} /> Upload files<input type="file" multiple hidden accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.webp" onChange={async (event) => { const selected = Array.from(event.target.files ?? []); event.target.value = ""; for (const file of selected) await upload(file); }} /></label></div>
    {notice && <p className="cloud-notice" role="status">{notice}</p>}
    {busy && <p className="cloud-busy"><LoaderCircle className="spin" size={14} /> {progress === null ? "Working securely…" : "Uploading " + progress + "%"}</p>}
    {progress !== null && <div className="cloud-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: progress + "%" }} /></div>}
    {!documents.length ? <div className="cloud-empty"><FileText size={25} /><b>Your library is ready</b><p>Upload a document to keep it in your private cloud history.</p></div> : <div className="cloud-documents">{documents.map((row) => <article key={row.id} className="cloud-document"><span className="cloud-file-icon"><FileText size={19} /></span><span className="cloud-file-meta"><b>{row.name}</b><small>{(Number(row.size_bytes) / 1024 / 1024).toFixed(2)} MB · {new Date(row.created_at).toLocaleDateString()} · {row.status}</small></span><button title="Download" disabled={busy} onClick={() => void download(row)}><ArrowDownToLine size={16} /></button><button title="Delete" disabled={busy} onClick={() => void remove(row)}><Trash2 size={16} /></button>{/\.(docx?|pptx?)$/i.test(row.name) && <OnlyOfficeLauncher documentId={row.id} />}</article>)}</div>}
  </section>;
}
