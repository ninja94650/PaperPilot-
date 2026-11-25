"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const DocViewer = dynamic(
  () => import("@p10node/office-engine").then((module) => module.DocViewer),
  { ssr: false, loading: () => <div style={{ padding: 24, color: "#6d7b72", fontSize: 12 }}>Loading the browser-based Office editor…</div> }
);

type OfficeKind = "word" | "presentation";

const mimeByExtension: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  odp: "application/vnd.oasis.opendocument.presentation",
  rtf: "application/rtf",
};

export default function OfficeStudio({
  file,
  kind,
  onSave,
}: {
  file: File;
  kind: OfficeKind;
  onSave: (revision: File) => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(0);

  function saveRevision(blob: Blob, suggestedName: string) {
    const nextRevision = revision + 1;
    setRevision(nextRevision);
    const sourceName = suggestedName || file.name;
    const extension = sourceName.includes(".") ? sourceName.split(".").pop()!.toLowerCase() : (kind === "word" ? "docx" : "pptx");
    const baseName = sourceName.replace(/\.[^.]+$/, "") || "document";
    const name = `${baseName}-revision-${nextRevision}.${extension}`;
    const output = new File([blob], name, {
      type: blob.type || mimeByExtension[extension] || file.type || "application/octet-stream",
      lastModified: Date.now(),
    });
    setDirty(false);
    onSave(output);
  }

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 0, display: "flex", flexDirection: "column", background: "#fff", borderRadius: 6, overflow: "hidden" }}>
      <div role="status" aria-live="polite" style={{ minHeight: 25, padding: "5px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottom: "1px solid #e7ece8", color: "#718078", fontSize: 9 }}>
        <span>{kind === "word" ? "Word Studio" : "Presentation Studio"} · browser-local editing</span>
        <span style={{ color: dirty ? "#a76b27" : "#43856b", fontWeight: 700 }}>{dirty ? "Unsaved changes · Save to create a revision" : "Original preserved · Save creates a new revision"}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DocViewer
          src={file}
          name={file.name}
          editable
          allowSave
          allowDownload
          onDirtyChange={setDirty}
          onSave={saveRevision}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}
