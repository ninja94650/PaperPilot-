import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DocViewer } from "@p10node/office-engine";
import "@p10node/office-engine/styles.css";

type OfficeEvents = { type: string; [key: string]: unknown };
declare global {
  interface Window {
    __paperpilotOffice: {
      events: OfficeEvents[];
      saved: Blob | null;
      savedName: string;
      reopenSaved: () => void;
    };
  }
}
window.__paperpilotOffice = { events: [], saved: null, savedName: "", reopenSaved: () => {} };

function Harness() {
  const [file, setFile] = useState<File | null>(null);
  const [generation, setGeneration] = useState(0);
  const [loadError, setLoadError] = useState("");
  const requested = new URLSearchParams(location.search).get("file") || "/complex.docx";

  useEffect(() => {
    let cancelled = false;
    fetch(requested).then(async (response) => {
      if (!response.ok) throw new Error("Fixture request failed: " + response.status);
      const blob = await response.blob();
      const name = requested.split("/").pop() || "fixture.docx";
      if (!cancelled) setFile(new File([blob], name, { type: name.endsWith(".pptx") ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    }).catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, [requested]);

  window.__paperpilotOffice.reopenSaved = () => {
    const saved = window.__paperpilotOffice.saved;
    if (!saved) throw new Error("No saved Office revision is available.");
    setFile(new File([saved], window.__paperpilotOffice.savedName, { type: file?.type || "application/octet-stream" }));
    setGeneration((value) => value + 1);
  };

  if (loadError) return <pre role="alert">{loadError}</pre>;
  if (!file) return <div role="status">Loading fixture…</div>;

  return <div style={{ height: "100vh", width: "100vw" }}>
    <DocViewer
      key={generation}
      src={file}
      name={file.name}
      editable
      allowSave
      allowDownload={false}
      allowOpen={false}
      onLoad={(client) => window.__paperpilotOffice.events.push({ type: "load", kind: client.kind })}
      onDirtyChange={(dirty) => window.__paperpilotOffice.events.push({ type: "dirty", dirty })}
      onSave={(blob, name) => {
        window.__paperpilotOffice.saved = blob;
        window.__paperpilotOffice.savedName = name;
        window.__paperpilotOffice.events.push({ type: "save", name, size: blob.size });
      }}
      onError={(error) => window.__paperpilotOffice.events.push({ type: "error", message: error.message })}
      style={{ height: "100%", width: "100%" }}
    />
  </div>;
}

createRoot(document.getElementById("root")!).render(<Harness />);
