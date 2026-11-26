"use client";

import { useState } from "react";
import { Download, Trash2, FileText, LoaderCircle, Check, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type DocumentRow = {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  storage_path: string;
  created_at: string;
};

export default function CloudDocuments({ documents }: { documents: DocumentRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function download(id: string, path: string) {
    setBusy(id);
    setMessage("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 60);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download could not be prepared.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string, path: string) {
    if (!window.confirm("Permanently delete this cloud document from your private vault?")) return;
    setBusy(id);
    setMessage("");
    try {
      const supabase = createClient();
      const { error: storageError } = await supabase.storage.from("documents").remove([path]);
      if (storageError) throw storageError;
      const { error: rowError } = await supabase.from("documents").delete().eq("id", id);
      if (rowError) throw rowError;
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setBusy(null);
    }
  }

  if (!documents.length) {
    return (
      <div style={emptyBoxStyle}>
        <FileText size={36} color="#94A3B8" style={{ margin: "0 auto 10px" }} />
        <b style={{ display: "block", color: "#0F172A", fontSize: 14 }}>No cloud documents saved yet</b>
        <p style={{ margin: "4px 0 0", fontSize: 12 }}>
          Use &ldquo;Save to Cloud&rdquo; inside the PaperPilot workspace to store documents privately.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
      {message && (
        <p role="status" style={{ color: "#E11D48", fontSize: 13, background: "#FFE4E6", padding: 8, borderRadius: 6 }}>
          {message}
        </p>
      )}
      {documents.map((doc) => (
        <div key={doc.id} style={docRowStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={docIconWrapStyle}>
              <FileText size={18} color="#4F46E5" />
            </div>
            <div>
              <b style={{ fontSize: 13, color: "#0F172A" }}>{doc.name}</b>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                {Math.ceil(Number(doc.size_bytes) / 1024)} KB · {doc.status} · {new Date(doc.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              disabled={!!busy}
              onClick={() => download(doc.id, doc.storage_path)}
              style={actionBtnStyle}
            >
              {busy === doc.id ? <LoaderCircle size={13} className="spin-fast" /> : <Download size={13} />}
              <span>Download</span>
            </button>
            <button
              disabled={!!busy}
              onClick={() => remove(doc.id, doc.storage_path)}
              style={{ ...actionBtnStyle, color: "#E11D48" }}
            >
              <Trash2 size={13} />
              <span>Delete</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const emptyBoxStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 36,
  border: "1.5px dashed #E2E8F0",
  borderRadius: 14,
  textAlign: "center",
  color: "#64748B",
  background: "#F8FAFC",
};

const docRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "12px 16px",
  border: "1px solid #E2E8F0",
  borderRadius: 10,
  background: "#FFFFFF",
  flexWrap: "wrap",
};

const docIconWrapStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  background: "#EEF2FF",
  display: "grid",
  placeItems: "center",
};

const actionBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: "6px 12px",
  background: "#FFFFFF",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
  color: "#334155",
};
