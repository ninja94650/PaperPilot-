"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ArrowDownToLine, CloudUpload, FileText, LoaderCircle, Trash2 } from "lucide-react";
import OnlyOfficeLauncher from "@/components/onlyoffice-launcher";

type DocumentRow = { id: string; file_name: string; object_path: string; mime_type: string; file_size: number; created_at: string };
const bucket = "paperpilot-documents";

export default function CloudLibrary({ initialDocuments }: { initialDocuments: DocumentRow[] }) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [busy, setBusy] = useState(false);
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
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
      if (uploadError) throw uploadError;
      const { data, error: insertError } = await supabase.from("documents").insert({
        user_id: user.id, file_name: file.name, object_path: path, mime_type: file.type || "application/octet-stream", file_size: file.size
      }).select("id,file_name,object_path,mime_type,file_size,created_at").single();
      if (insertError) {
        await supabase.storage.from(bucket).remove([path]);
        throw insertError;
      }
      setDocuments((current) => [data as DocumentRow, ...current]);
      setNotice("Uploaded securely to your private library.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Upload failed.");
    } finally { setBusy(false); }
  }

  async function download(row: DocumentRow) {
    setBusy(true); setNotice("");
    try {
      const { data, error } = await createClient().storage.from(bucket).createSignedUrl(row.object_path, 60);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Download failed."); }
    finally { setBusy(false); }
  }

  async function remove(row: DocumentRow) {
    if (!window.confirm("Permanently delete " + row.file_name + " from your cloud library?")) return;
    setBusy(true); setNotice("");
    try {
      const supabase = createClient();
      const { error: storageError } = await supabase.storage.from(bucket).remove([row.object_path]);
      if (storageError) throw storageError;
      const { error } = await supabase.from("documents").delete().eq("id", row.id);
      if (error) throw error;
      setDocuments((current) => current.filter((item) => item.id !== row.id));
      setNotice("Document deleted.");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Delete failed."); }
    finally { setBusy(false); }
  }

  return <section className="cloud-library">
    <div className="cloud-library-head"><div><h2>Cloud library</h2><p>Private files saved to your account. 20 MB per file.</p></div><label className="cloud-upload-button"><CloudUpload size={16} /> Upload files<input type="file" multiple hidden onChange={async (event) => { const selected = Array.from(event.target.files ?? []); event.target.value = ""; for (const file of selected) await upload(file); }} /></label></div>
    {notice && <p className="cloud-notice" role="status">{notice}</p>}
    {busy && <p className="cloud-busy"><LoaderCircle className="spin" size={14} /> Working securely…</p>}
    {!documents.length ? <div className="cloud-empty"><FileText size={25} /><b>Your library is ready</b><p>Upload a document to keep it in your private cloud history.</p></div> : <div className="cloud-documents">{documents.map((row) => <article key={row.id} className="cloud-document"><span className="cloud-file-icon"><FileText size={19} /></span><span className="cloud-file-meta"><b>{row.file_name}</b><small>{(row.file_size / 1024 / 1024).toFixed(2)} MB · {new Date(row.created_at).toLocaleDateString()}</small></span><button title="Download" disabled={busy} onClick={() => void download(row)}><ArrowDownToLine size={16} /></button><button title="Delete" disabled={busy} onClick={() => void remove(row)}><Trash2 size={16} /></button>{/\.(docx?|pptx?)$/i.test(row.file_name) && <OnlyOfficeLauncher documentId={row.id} />}</article>)}</div>}
  </section>;
}
