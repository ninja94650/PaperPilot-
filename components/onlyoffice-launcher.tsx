"use client";

import { useEffect, useId, useState } from "react";
import { LoaderCircle, Pencil, X } from "lucide-react";

type EditorConfig = { documentServerUrl: string; config: Record<string, unknown> };
type EditorInstance = { destroyEditor?: () => void };
declare global {
  interface Window {
    DocsAPI?: { DocEditor: new (elementId: string, config: Record<string, unknown>) => EditorInstance };
  }
}

export default function OnlyOfficeLauncher({ documentId }: { documentId: string }) {
  const generatedId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const elementId = "paperpilot-onlyoffice-" + generatedId;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<EditorConfig | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  async function launch() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/onlyoffice/config?documentId=" + encodeURIComponent(documentId), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "ONLYOFFICE could not be opened.");
      setEditor(payload as EditorConfig);
      setReady(false);
      setOpen(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open the editor.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (!open || !editor) return;
    let instance: EditorInstance | null = null;
    let cancelled = false;
    const scriptUrl = editor.documentServerUrl.replace(/\/+$/, "") + "/web-apps/apps/api/documents/api.js";
    const initialize = () => {
      if (cancelled || !window.DocsAPI) return;
      const config = { ...editor.config, events: { onDocumentReady: () => setReady(true), onError: () => setError("The ONLYOFFICE editor reported an error.") } };
      instance = new window.DocsAPI.DocEditor(elementId, config);
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-paperpilot-onlyoffice="true"]');
    if (window.DocsAPI) initialize();
    else if (existing) existing.addEventListener("load", initialize, { once: true });
    else {
      const script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      script.dataset.paperpilotOnlyoffice = "true";
      script.onload = initialize;
      script.onerror = () => setError("The ONLYOFFICE Docs server could not be reached.");
      document.body.appendChild(script);
    }
    return () => { cancelled = true; instance?.destroyEditor?.(); };
  }, [open, editor, elementId]);

  return <>
    <button className="onlyoffice-launch" onClick={() => void launch()} disabled={loading}><Pencil size={14} /> {loading ? "Opening…" : "Edit"}</button>
    {error && <span className="onlyoffice-error" role="status">{error}</span>}
    {open && editor && <div className="onlyoffice-backdrop">
      <section className="onlyoffice-window">
        <header><b>PaperPilot · ONLYOFFICE editor</b><button onClick={() => { setOpen(false); setEditor(null); setReady(false); }} aria-label="Close editor"><X size={18} /></button></header>
        <div id={elementId} className="onlyoffice-frame">{!ready && <div className="onlyoffice-loading"><LoaderCircle className="spin" size={22} /> Connecting to ONLYOFFICE…</div>}</div>
      </section>
    </div>}
  </>;
}
