"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { createViewerController, useViewerState } from "@p10node/office-engine";
import { createClient } from "@/lib/supabase/client";
import {
  createOfficeSessionId,
  ensureOfficeDraftSession,
  saveOfficeDraftRevision,
  setOfficeCloudLink,
  updateOfficeCloudParent,
  type OfficeEditorKind
} from "@/lib/editor/local-drafts";

const DocViewer = dynamic(
  () => import("@p10node/office-engine").then((module) => module.DocViewer),
  { ssr: false, loading: () => <div style={{ padding: 24, color: "#6d7b72", fontSize: 12 }}>Loading the browser-based Office editor…</div> }
);

const mimeByExtension: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
const sourceMimeByExtension: Record<string, string> = {
  doc: "application/msword",
  docx: mimeByExtension.docx,
  ppt: "application/vnd.ms-powerpoint",
  pptx: mimeByExtension.pptx,
  odt: "application/vnd.oasis.opendocument.text",
  odp: "application/vnd.oasis.opendocument.presentation",
  rtf: "application/rtf"
};
function mimeForFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  return file.type || sourceMimeByExtension[extension] || "application/octet-stream";
}

type RevisionRow = {
  id: string;
  version: number;
  parent_revision_id: string | null;
  name: string;
  mime_type: string;
  editor_kind: OfficeEditorKind;
  size_bytes: number;
  created_at: string;
};

type RevisionMeta = { sessionId: string; version: number; revisionId?: string };

export default function OfficeStudio({
  file,
  sourceFile,
  kind,
  sessionId: sessionIdProp,
  cloudDocumentId: cloudDocumentIdProp,
  parentRevisionId: parentRevisionIdProp,
  onSessionReady,
  onCloudLink,
  onSave,
  onRestore,
}: {
  file: File;
  sourceFile?: File;
  kind: OfficeEditorKind;
  sessionId?: string;
  cloudDocumentId?: string | null;
  parentRevisionId?: string | null;
  onSessionReady?: (sessionId: string, sourceFile: File, kind: OfficeEditorKind) => void;
  onCloudLink?: (sessionId: string, documentId: string, parentRevisionId: string | null) => void;
  onSave: (revision: File, meta: RevisionMeta) => void;
  onRestore?: (revision: File, meta: RevisionMeta) => void;
}) {
  const [controller] = useState(() => createViewerController());
  const viewerState = useViewerState(controller);
  const [dirty, setDirty] = useState(false);
  const [sessionId, setSessionId] = useState(sessionIdProp || "");
  const [revision, setRevision] = useState(0);
  const [saveEpoch, setSaveEpoch] = useState(0);
  const [cloudDocumentId, setCloudDocumentId] = useState<string | null>(cloudDocumentIdProp ?? null);
  const [parentRevisionId, setParentRevisionId] = useState<string | null>(parentRevisionIdProp ?? null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [history, setHistory] = useState<RevisionRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [message, setMessage] = useState("Autosave is local to this browser. Enable cloud history for private account-backed revisions.");
  const saving = useRef(false);
  const original = sourceFile ?? file;
  const onSessionReadyRef = useRef(onSessionReady);
  onSessionReadyRef.current = onSessionReady;

  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      try {
        const id = sessionIdProp || await createOfficeSessionId(original, kind);
        const existing = await ensureOfficeDraftSession(id, original, kind);
        if (cancelled) return;
        setSessionId(id);
        setRevision(existing?.latestVersion ?? 0);
        if (existing?.cloudDocumentId) setCloudDocumentId(existing.cloudDocumentId);
        if (existing?.parentRevisionId) setParentRevisionId(existing.parentRevisionId);
        onSessionReadyRef.current?.(id, original, kind);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Local autosave is unavailable.");
      }
    }
    void prepare();
    return () => { cancelled = true; };
  }, [file, original, kind, sessionIdProp]);

  useEffect(() => {
    if (!viewerState.dirty || !sessionId || saving.current) return;
    const timer = window.setTimeout(() => {
      if (!saving.current) void controller.save().catch((error) => setMessage(error instanceof Error ? error.message : "Automatic Office save failed."));
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [viewerState.dirty, viewerState.rev, controller, sessionId, saveEpoch]);

  useEffect(() => {
    setCloudDocumentId(cloudDocumentIdProp ?? null);
    setParentRevisionId(parentRevisionIdProp ?? null);
  }, [cloudDocumentIdProp, parentRevisionIdProp]);

  async function loadHistory(documentId = cloudDocumentId) {
    if (!documentId) return;
    const response = await fetch("/api/editor/revisions?documentId=" + encodeURIComponent(documentId), { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load cloud revision history.");
    setHistory(payload.revisions ?? []);
  }

  async function publishCloudRevision(output: File, id: string) {
    if (!cloudDocumentId) return;
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Sign in again to continue cloud autosave.");
    const revisionId = crypto.randomUUID();
    const safeName = output.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || (kind === "word" ? "revision.docx" : "revision.pptx");
    const storagePath = user.id + "/" + cloudDocumentId + "/editor/" + revisionId + "/" + safeName;
    const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, output, {
      contentType: output.type || mimeByExtension[kind === "word" ? "docx" : "pptx"],
      upsert: false
    });
    if (uploadError) throw new Error("Cloud revision upload failed: " + uploadError.message);
    const response = await fetch("/api/editor/revisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: cloudDocumentId,
        revisionId,
        parentRevisionId,
        storagePath,
        name: safeName,
        editorKind: kind
      })
    });
    const payload = await response.json();
    if (response.status !== 202 || payload.scanStatus !== "queued") {
      await supabase.storage.from("documents").remove([storagePath]);
      throw new Error(payload.error || "Cloud revision was not accepted for malware inspection.");
    }
    setMessage("Cloud revision uploaded and quarantined. Waiting for ClamAV inspection…");
    let scan: { scanStatus: string; revision?: { id: string; version: number }; errorCode?: string } | null = null;
    for (let attempt = 0; attempt < 45; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      const statusResponse = await fetch("/api/editor/revisions?revisionId=" + encodeURIComponent(revisionId), { cache: "no-store" });
      const statusPayload = await statusResponse.json();
      if (!statusResponse.ok) throw new Error(statusPayload.error || "Could not verify the ClamAV result.");
      scan = statusPayload;
      if (scan.scanStatus === "clean") break;
      if (scan.scanStatus === "rejected" || scan.scanStatus === "failed") {
        throw new Error(scan.scanStatus === "rejected" ? "ClamAV rejected this Office revision. It was not published." : "ClamAV could not complete inspection. The revision remains unavailable.");
      }
    }
    if (!scan || scan.scanStatus !== "clean" || !scan.revision?.id) {
      setMessage("Revision remains quarantined while the scanner queue completes. It is not yet in cloud history.");
      return;
    }
    const publishedId = scan.revision.id;
    setParentRevisionId(publishedId);
    await updateOfficeCloudParent(id, publishedId);
    await loadHistory();
    setMessage("ClamAV inspection passed. Cloud revision " + scan.revision.version + " is now published.");
  }

  async function saveRevision(blob: Blob, suggestedName: string) {
    if (saving.current || !sessionId) return;
    saving.current = true;
    try {
      const extension = kind === "word" ? "docx" : "pptx";
      const sourceName = suggestedName || file.name;
      const baseName = sourceName.replace(/\.[^.]+$/, "") || "document";
      const output = new File([blob], baseName + "-edited." + extension, {
        type: blob.type || mimeByExtension[extension],
        lastModified: Date.now(),
      });
      const saved = await saveOfficeDraftRevision({
        sessionId,
        sourceFile: original,
        kind,
        revisionFile: output
      });
      setRevision(saved.version);
      setDirty(false);
      onSave(output, { sessionId, version: saved.version });
      setMessage("Autosaved locally · revision " + saved.version + ".");
      if (cloudDocumentId) {
        try { await publishCloudRevision(output, sessionId); }
        catch (error) {
          setMessage("Local revision " + saved.version + " is safe. Cloud sync paused: " + (error instanceof Error ? error.message : "unknown error"));
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Office revision could not be saved.");
    } finally {
      saving.current = false;
      setSaveEpoch((value) => value + 1);
    }
  }

  async function enableCloudHistory() {
    if (!sessionId || cloudBusy) return;
    setCloudBusy(true);
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Sign in to enable private cloud history.");
      const safeName = original.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
      const storagePath = user.id + "/" + crypto.randomUUID() + "/" + safeName;
      const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, original, {
        contentType: mimeForFile(original),
        upsert: false
      });
      if (uploadError) throw new Error("Original upload failed: " + uploadError.message);
      const { data: document, error: rowError } = await supabase.from("documents").insert({
        owner_id: user.id,
        name: original.name,
        mime_type: mimeForFile(original),
        size_bytes: original.size,
        storage_path: storagePath,
        status: "uploaded"
      }).select("id").single();
      if (rowError || !document) {
        await supabase.storage.from("documents").remove([storagePath]);
        throw new Error("Could not create the private cloud document record.");
      }
      await setOfficeCloudLink(sessionId, document.id, parentRevisionId);
      setCloudDocumentId(document.id);
      onCloudLink?.(sessionId, document.id, parentRevisionId);
      setMessage("Cloud history enabled. The original is private and future autosaves create immutable revisions.");
      await loadHistory(document.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cloud history could not be enabled.");
    } finally {
      setCloudBusy(false);
    }
  }

  async function restoreRevision(item: RevisionRow) {
    setCloudBusy(true);
    try {
      const response = await fetch("/api/editor/revisions/" + item.id + "/download", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not download this private revision.");
      const blob = await response.blob();
      const restored = new File([blob], item.name, { type: item.mime_type, lastModified: Date.now() });
      setParentRevisionId(item.id);
      await updateOfficeCloudParent(sessionId, item.id);
      onRestore?.(restored, { sessionId, version: item.version, revisionId: item.id });
      setMessage("Revision " + item.version + " opened as the current working copy. The history remains unchanged.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Revision restore failed.");
    } finally {
      setCloudBusy(false);
    }
  }

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 0, display: "flex", flexDirection: "column", background: "#fff", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ minHeight: 30, padding: "5px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottom: "1px solid #e7ece8", color: "#718078", fontSize: 10, flexWrap: "wrap" }}>
        <span>{kind === "word" ? "Word Studio" : "Presentation Studio"} · autosave {viewerState.saving ? "saving…" : viewerState.dirty ? "pending…" : "ready"} · local revision {revision}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {cloudDocumentId ? <button type="button" onClick={() => { setHistoryOpen((value) => !value); void loadHistory().catch((error) => setMessage(error.message)); }} style={smallButton}>Cloud history ({history.length})</button> : <button type="button" disabled={!sessionId || cloudBusy} onClick={enableCloudHistory} style={smallButton}>{cloudBusy ? "Enabling…" : "Enable cloud history"}</button>}
          <span style={{ color: dirty ? "#a76b27" : "#43856b", fontWeight: 700 }}>{dirty ? "Unsaved edits" : "Original preserved"}</span>
        </div>
      </div>
      {historyOpen && cloudDocumentId && <div style={{ maxHeight: 140, overflowY: "auto", borderBottom: "1px solid #e7ece8", padding: 8, display: "grid", gap: 5 }}>
        {history.length === 0 ? <small>No cloud revisions yet. Your original remains stored privately.</small> : history.map((item) => <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 10 }}>
          <span>v{item.version} · {item.name} · {new Date(item.created_at).toLocaleString()}</span>
          <button type="button" disabled={cloudBusy} onClick={() => void restoreRevision(item)} style={smallButton}>Restore as working copy</button>
        </div>)}
      </div>}
      <div role="status" aria-live="polite" style={{ padding: "4px 10px", color: "#718078", fontSize: 10 }}>{message}</div>
      {cloudDocumentId && <div style={{ padding: "3px 10px", color: "#9a6424", background: "#fff9ed", fontSize: 9 }}>Cloud revisions stay quarantined until the isolated ClamAV worker confirms a clean scan. If the scanner is offline, the revision remains unavailable; your local autosave and original stay safe.</div>}
      <div style={{ flex: 1, minHeight: 0 }}>
        <DocViewer
          src={file}
          name={file.name}
          controller={controller}
          editable
          allowSave
          allowDownload
          allowOpen={false}
          onDirtyChange={setDirty}
          onSave={saveRevision}
          onError={(error) => setMessage("Office editor: " + error.message)}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

const smallButton: React.CSSProperties = {
  border: "1px solid #dce5df",
  borderRadius: 6,
  padding: "4px 8px",
  background: "#fff",
  color: "#476b57",
  fontSize: 10,
  fontWeight: 700,
  cursor: "pointer"
};
