"use client";

import { useState } from "react";
import { ArrowDownToLine, Check, FileArchive, FileImage, LoaderCircle, ScanText, X } from "lucide-react";
import { compressPdfRasterized, imageFilesToPdf, ocrPdf, pdfToPngs } from "@/lib/pdf-advanced";

type ToolKind = "compress" | "convert" | "ocr";
function download(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function AdvancedToolDialog({ tool, files, onClose, onResult }: {
  tool: ToolKind; files: File[]; onClose: () => void; onResult: (file: File) => void;
}) {
  const [quality, setQuality] = useState("0.72");
  const [language, setLanguage] = useState("eng");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState("");
  const pdfs = files.filter((file) => file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf");
  const images = files.filter((file) => file.type.startsWith("image/"));
  const office = files.filter((file) => /\.(docx?|pptx?)$/i.test(file.name));
  const file = pdfs[0] ?? images[0] ?? office[0];

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
        const data = new FormData();
        data.append("file", officeFile);
        const response = await fetch("/api/convert", { method: "POST", body: data });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Office conversion is unavailable.");
        const blob = await response.blob();
        const result = new File([blob], file.name.replace(/\.(docx?|pptx?)$/i, "") + ".pdf", { type: "application/pdf" });
        download(result);
        onResult(result);
        setMessage("Office document converted to PDF.");
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "The operation could not be completed.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return <div className="pp-tool-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="pp-tool-dialog" role="dialog" aria-modal="true" aria-labelledby="pp-tool-title">
      <header><div><span className="pp-tool-symbol">{tool === "compress" ? <FileArchive size={20} /> : tool === "ocr" ? <ScanText size={20} /> : <FileImage size={20} />}</span><div><h2 id="pp-tool-title">{tool === "compress" ? "Compress PDF" : tool === "ocr" ? "OCR PDF" : "Convert files"}</h2><p>Runs in your browser unless an Office worker is configured.</p></div></div><button aria-label="Close" onClick={onClose} disabled={busy}><X size={19} /></button></header>
      <div className="pp-tool-content">
        <div className="pp-tool-file">{file ? <><b>{file.name}</b><span>{(file.size / 1024 / 1024).toFixed(2)} MB</span></> : <p>Import a supported file to begin.</p>}</div>
        {tool === "compress" && <div className="pp-tool-option"><label htmlFor="pp-quality">Image quality</label><select id="pp-quality" value={quality} onChange={(event) => setQuality(event.target.value)}><option value="0.9">High quality — larger file</option><option value="0.72">Balanced — recommended</option><option value="0.48">Smallest — lower quality</option></select><small>This compression rebuilds pages as images. Searchable text, links, forms and vector content will be flattened.</small></div>}
        {tool === "ocr" && <div className="pp-tool-option"><label htmlFor="pp-language">Recognition language</label><select id="pp-language" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="eng">English</option><option value="hin">Hindi</option><option value="deu">German</option><option value="fra">French</option><option value="spa">Spanish</option></select><small>Exports recognized text as a .txt transcript. The original PDF is not modified.</small></div>}
        {tool === "convert" && <div className="pp-tool-convert-list">
          {images.length > 0 && <button disabled={busy} onClick={() => run("images-pdf")}>Images to PDF <ArrowDownToLine size={15} /></button>}
          {pdfs.length > 0 && <button disabled={busy} onClick={() => run("pdf-images")}>PDF pages to PNG images <ArrowDownToLine size={15} /></button>}
          {office.length > 0 && <button disabled={busy} onClick={() => run("office")}>DOCX / PPTX to PDF (worker) <ArrowDownToLine size={15} /></button>}
          {!images.length && !pdfs.length && !office.length && <p>Supported: PDF, DOC, DOCX, PPT, PPTX, JPG, PNG and WebP.</p>}
        </div>}
        {busy && <div className="pp-tool-progress"><LoaderCircle className="spin" size={17} /> {progress || "Preparing your file…"}</div>}
        {message && <div className="pp-tool-message"><Check size={15} /> {message}</div>}
      </div>
      <footer>
        {tool === "compress" && <button className="pp-tool-primary" disabled={!pdfs.length || busy} onClick={() => run("compress")}>{busy ? "Compressing…" : "Compress and download"}</button>}
        {tool === "ocr" && <button className="pp-tool-primary" disabled={!pdfs.length || busy} onClick={() => run("ocr")}>{busy ? "Recognizing…" : "Extract text"}</button>}
        {tool === "convert" && <button className="pp-tool-secondary" onClick={onClose}>Close</button>}
      </footer>
    </section>
  </div>;
}
