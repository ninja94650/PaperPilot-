"use client";

import { useState } from "react";
import { ArrowDownToLine, Check, FileArchive, FileImage, LoaderCircle, ScanText, X } from "lucide-react";
import { compressPdfRasterized, imageFilesToPdf, ocrPdf, pdfToPngs } from "@/lib/pdf-advanced";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

type ToolKind = "compress" | "convert" | "ocr";
function download(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function AdvancedToolDialog({ tool, files, onClose, onResult }: {
  tool: ToolKind; files: File[]; onClose: () => void; onResult: (file: File) => void;
}) {
  const [quality, setQuality] = useState("0.72");
  const [language, setLanguage] = useState("eng");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState("");
  const [activeJobId, setActiveJobId] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const pdfs = files.filter((file) => file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf");
  const images = files.filter((file) => file.type.startsWith("image/"));
  const office = files.filter((file) => /\.(docx?|pptx?)$/i.test(file.name));
  const file = pdfs[0] ?? images[0] ?? office[0];

  async function cancelJob() {
    if (!activeJobId || cancelling) return;
    setCancelling(true);
    try {
      const response = await fetch("/api/processing/jobs/" + activeJobId + "/cancel", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Cancellation could not be requested.");
      setMessage("Cancellation requested. The worker will stop at its next safe checkpoint.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cancellation failed.");
    } finally { setCancelling(false); }
  }

  async function run(action: "compress" | "ocr" | "images-pdf" | "pdf-images" | "office") {
    if (!file || busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (action === "compress") {
        const compressed = await compressPdfRasterized(file, Number(quality), (done, total) => setProgress("Compressing page " + done + " of " + total));
        download(compressed);
        const saved = file.size - compressed.size;
        setMessage(saved > 0 ? "Saved " + Math.round((saved / file.size) * 100) + "% (" + (saved / 1024).toFixed(0) + " KB)." : "The compressed PDF is " + Math.abs(Math.round((saved / 1024))) + " KB larger. You can still download it.");
        onResult(compressed);
      } else if (action === "ocr") {
        const text = await ocrPdf(file, language, (done, total) => setProgress("Recognizing page " + done + " of " + total));
        const result = new File([text], file.name.replace(/\.pdf$/i, "") + "-ocr.txt", { type: "text/plain;charset=utf-8" });
        download(result);
        setMessage("OCR transcript exported as a text file.");
      } else if (action === "images-pdf") {
        const result = await imageFilesToPdf(images);
        download(result);
        onResult(result);
        setMessage("Images combined into a PDF.");
      } else if (action === "pdf-images") {
        const results = await pdfToPngs(file);
        results.forEach((item) => download(item));
        setMessage(results.length + " page image(s) exported.");
      } else {
        const officeFile = office[0];
        if (!officeFile) throw new Error("Choose a DOC, DOCX, PPT or PPTX file.");
        if (officeFile.size > 20 * 1024 * 1024) throw new Error("Office inputs must be 20 MB or smaller.");
        setProgress("Uploading to private storage…");
        const supabase = createSupabaseClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("Sign in before using secure Office conversion.");
        const safeName = officeFile.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document.docx";
        const extension = officeFile.name.split(".").pop()?.toLowerCase();
        const officeMime: Record<string, string> = {
          doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        };
        const mimeType = officeMime[extension || ""];
        if (!mimeType) throw new Error("Unsupported Office file type.");
        const storagePath = user.id + "/" + crypto.randomUUID() + "/" + safeName;
        const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, officeFile, {
          upsert: false, contentType: mimeType
        });
        if (uploadError) throw new Error("Private upload failed: " + uploadError.message);
        const { data: document, error: documentError } = await supabase.from("documents").insert({
          owner_id: user.id, name: safeName, mime_type: mimeType,
          size_bytes: officeFile.size, storage_path: storagePath, status: "uploaded"
        }).select("id").single();
        if (documentError || !document) {
          await supabase.storage.from("documents").remove([storagePath]);
          throw new Error("Could not create the private document record.");
        }
        const created = await fetch("/api/processing/jobs", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: document.id, tool: "office-to-pdf", idempotencyKey: crypto.randomUUID() })
        });
        const createdBody = await created.json();
        if (!created.ok || !createdBody.job?.id) {
          await supabase.from("documents").delete().eq("id", document.id);
          await supabase.storage.from("documents").remove([storagePath]);
          throw new Error(createdBody.error || "Could not enqueue Office conversion.");
        }
        const jobId = String(createdBody.job.id);
        setActiveJobId(jobId);
        setProgress("Waiting for security inspection…");
        let finished = false;
        for (let attempt = 0; attempt < 450; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
          const statusResponse = await fetch("/api/processing/jobs/" + jobId, { cache: "no-store" });
          const statusBody = await statusResponse.json();
          if (!statusResponse.ok) throw new Error(statusBody.error || "Could not retrieve job status.");
          const job = statusBody.job;
          setProgress(job.progress_message || (job.status === "queued" ? "Waiting in queue…" : "Processing…") + " " + job.progress_percent + "%");
          if (job.status === "failed") throw new Error(job.error_message || "The document could not be processed.");
          if (job.status === "cancelled") throw new Error("Processing was cancelled.");
          if (job.status === "succeeded") {
            const downloadResponse = await fetch("/api/processing/jobs/" + jobId + "/download", { cache: "no-store" });
            const downloadBody = await downloadResponse.json();
            if (!downloadResponse.ok || !downloadBody.url) throw new Error(downloadBody.error || "The output is not available.");
            const outputResponse = await fetch(downloadBody.url, { cache: "no-store" });
            if (!outputResponse.ok) throw new Error("Could not download the private output.");
            const result = new File([await outputResponse.blob()], officeFile.name.replace(/\.(docx?|pptx?)$/i, "") + ".pdf", { type: "application/pdf" });
            download(result);
            onResult(result);
            setMessage("Office conversion completed. Private revision " + downloadBody.version + " saved to your account.");
            finished = true;
            break;
          }
          if (job.cancel_requested_at) setMessage("Cancellation requested…");
        }
        if (!finished) throw new Error("This job is still running. You can check its status in your account workspace.");
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "The operation could not be completed.");
    } finally {
      setBusy(false);
      setProgress("");
      setActiveJobId("");
    }
  }

  return <div className="pp-tool-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="pp-tool-dialog" role="dialog" aria-modal="true" aria-labelledby="pp-tool-title">
      <header><div><span className="pp-tool-symbol">{tool === "compress" ? <FileArchive size={20} /> : tool === "ocr" ? <ScanText size={20} /> : <FileImage size={20} />}</span><div><h2 id="pp-tool-title">{tool === "compress" ? "Compress PDF" : tool === "ocr" ? "OCR PDF" : "Convert files"}</h2><p>PDF and image tools run locally. Office conversion uses private cloud storage and an isolated queue.</p></div></div><button aria-label="Close" onClick={onClose} disabled={busy}><X size={19} /></button></header>
      <div className="pp-tool-content">
        <div className="pp-tool-file">{file ? <><b>{file.name}</b><span>{(file.size / 1024 / 1024).toFixed(2)} MB</span></> : <p>Import a supported file to begin.</p>}</div>
        {tool === "compress" && <div className="pp-tool-option"><label htmlFor="pp-quality">Image quality</label><select id="pp-quality" value={quality} onChange={(event) => setQuality(event.target.value)}><option value="0.9">High quality — larger file</option><option value="0.72">Balanced — recommended</option><option value="0.48">Smallest — lower quality</option></select><small>This compression rebuilds pages as images. Searchable text, links, forms and vector content will be flattened.</small></div>}
        {tool === "ocr" && <div className="pp-tool-option"><label htmlFor="pp-language">Recognition language</label><select id="pp-language" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="eng">English</option><option value="hin">Hindi</option><option value="deu">German</option><option value="fra">French</option><option value="spa">Spanish</option></select><small>Exports recognized text as a .txt transcript. The original PDF is not modified.</small></div>}
        {tool === "convert" && <div className="pp-tool-convert-list">
          {images.length > 0 && <button disabled={busy} onClick={() => run("images-pdf")}>Images to PDF <ArrowDownToLine size={15} /></button>}
          {pdfs.length > 0 && <button disabled={busy} onClick={() => run("pdf-images")}>PDF pages to PNG images <ArrowDownToLine size={15} /></button>}
          {office.length > 0 && <button disabled={busy} onClick={() => run("office")}>DOC / DOCX / PPT / PPTX to PDF (secure queue) <ArrowDownToLine size={15} /></button>}
          {!images.length && !pdfs.length && !office.length && <p>Supported: PDF, DOC, DOCX, PPT, PPTX, JPG, PNG and WebP.</p>}
        </div>}
        {busy && <div className="pp-tool-progress"><LoaderCircle className="spin" size={17} /> {progress || "Preparing your file…"} {activeJobId && <button onClick={cancelJob} disabled={cancelling}>{cancelling ? "Cancelling…" : "Cancel job"}</button>}</div>}
        {message && <div className="pp-tool-message"><Check size={15} /> {message}</div>}
      </div>
      <footer>
        {tool === "compress" && <button className="pp-tool-primary" disabled={!pdfs.length || busy} onClick={() => run("compress")}>{busy ? "Compressing…" : "Compress and download"}</button>}
        {tool === "ocr" && <button className="pp-tool-primary" disabled={!pdfs.length || busy} onClick={() => run("ocr")}>{busy ? "Recognizing…" : "Extract text"}</button>}
        {tool === "convert" && <button className="pp-tool-secondary" onClick={onClose} disabled={busy}>Close</button>}
      </footer>
    </section>
  </div>;
}
