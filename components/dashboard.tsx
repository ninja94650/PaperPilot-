"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, BadgeCheck, Check, ChevronRight,
  CloudUpload, Combine, FileArchive, FileImage, FilePlus2, FileSearch, FileStack,
  FileText, FolderOpen, Image as ImageIcon, LockKeyhole, Menu, PenLine, Plus,
  RotateCw, ScanText, Scissors, ShieldCheck, Sparkles, WandSparkles, X, Zap,
  Signature, LoaderCircle, Download, Upload, PanelLeftClose, Trash2
} from "lucide-react";
import { addTextToPdf, extractPages, mergePdfs, rotatePages, splitPdf } from "@/lib/pdf-tools";
import PdfPageWorkspace from "@/components/pdf-page-workspace";
import ImageStudio from "@/components/image-studio";
import OfficeStudio from "@/components/office-studio";
import AdvancedToolDialog from "@/components/advanced-tool-dialog";
import CloudSaveButton from "@/components/cloud-save-button";
import { detectDocumentFormat, editorLabel, type EditorKind } from "@/lib/document-format.mjs";
import { createOfficeSessionId, ensureOfficeDraftSession, listRecoveredOfficeDrafts, setOfficeCloudLink } from "@/lib/editor/local-drafts";

type ToolId = "merge" | "split" | "rotate" | "extract" | "annotate" | "sign" | "compress" | "convert" | "ocr";
type Tool = { id: ToolId; title: string; description: string; icon: typeof FileText; tint: string; ready: boolean; label?: string };
const maxFileSize = 20 * 1024 * 1024;
const maxFiles = 12;
const accepted = ".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.webp";

const tools: Tool[] = [
  { id: "merge", title: "Merge PDF", description: "Combine files into one clean document.", icon: Combine, tint: "violet", ready: true },
  { id: "split", title: "Split PDF", description: "Separate a document into smaller files.", icon: Scissors, tint: "blue", ready: true },
  { id: "compress", title: "Optimize PDF", description: "Compress with selectable quality; rasterized exports warn about flattened content.", icon: FileArchive, tint: "mint", ready: true },
  { id: "convert", title: "Images ↔ PDF", description: "Convert images to PDF or PDF pages to PNG; Office conversion stays available through the secure worker.", icon: FileImage, tint: "orange", ready: true },
  { id: "annotate", title: "Edit PDF", description: "Add text notes to your pages.", icon: PenLine, tint: "pink", ready: true },
  { id: "sign", title: "Sign PDF", description: "Place a signature on your document.", icon: Signature, tint: "mint", ready: true },
  { id: "rotate", title: "Rotate PDF", description: "Fix page orientation in a click.", icon: RotateCw, tint: "blue", ready: true },
  { id: "extract", title: "Extract pages", description: "Keep only the pages you need.", icon: FilePlus2, tint: "orange", ready: true },
  { id: "ocr", title: "OCR PDF", description: "Recognize text in scanned pages.", icon: ScanText, tint: "violet", ready: true }
];

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}
function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
function makeDownload(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function createPdfFile(bytes: Uint8Array, filename: string): File {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new File([buffer], filename, { type: "application/pdf" });
}

export default function Dashboard() {
  const [files, setFiles] = useState<File[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeAdvancedTool, setActiveAdvancedTool] = useState<"compress" | "convert" | "ocr" | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pageRange, setPageRange] = useState("1-1");
  const [annotation, setAnnotation] = useState("");
  const [signature, setSignature] = useState("");
  const [showTextPanel, setShowTextPanel] = useState<"annotate" | "sign" | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const [activeEditorKind, setActiveEditorKind] = useState<EditorKind>("pdf");
  const [formatWarning, setFormatWarning] = useState("");
  const [officeSessions, setOfficeSessions] = useState<Map<File, "word" | "presentation">>(new Map());
  const [officeSessionIds, setOfficeSessionIds] = useState<Map<File, string>>(new Map());
  const [officeSourceFiles, setOfficeSourceFiles] = useState<Map<string, File>>(new Map());
  const [officeCloudLinks, setOfficeCloudLinks] = useState<Map<string, { documentId: string; parentRevisionId: string | null }>>(new Map());
  const routeToken = useRef(0);
  const filesRef = useRef<File[]>(files);
  filesRef.current = files;

  const activeFile = files[activeIndex] ?? null;
  const pdfFiles = files.filter(isPdf);
  const visibleTools = useMemo(() => tools.filter((tool) =>
    (tool.title + " " + tool.description).toLowerCase().includes(search.toLowerCase())
  ), [search]);

  useEffect(() => {
    if (activeAdvancedTool && files.length > 0) {
      setShowAdvanced(true);
      setEditing(true);
      setActiveTool(activeAdvancedTool);
      void routeToFile(files[activeIndex] ?? files[0]);
    }
  }, [activeAdvancedTool, files.length]);

  useEffect(() => {
    let cancelled = false;
    void listRecoveredOfficeDrafts().then((drafts) => {
      if (cancelled || drafts.length === 0 || filesRef.current.length > 0) return;
      const recovered = drafts.map((draft) => draft.latestFile);
      setFiles(recovered);
      setActiveIndex(0);
      setOfficeSessions(new Map(drafts.map((draft) => [draft.latestFile, draft.kind])));
      setOfficeSessionIds(new Map(drafts.map((draft) => [draft.latestFile, draft.sessionId])));
      setOfficeSourceFiles(new Map(drafts.map((draft) => [draft.sessionId, draft.sourceFile])));
      setOfficeCloudLinks(new Map(drafts.filter((draft) => draft.cloudDocumentId).map((draft) => [draft.sessionId, {
        documentId: draft.cloudDocumentId!,
        parentRevisionId: draft.parentRevisionId
      }])));
      setEditing(true);
      setNotice("Recovered " + drafts.length + " Office draft(s) from this browser. Your original files remain preserved.");
      void routeToFile(recovered[0]);
    }).catch((error) => {
      if (!cancelled) setNotice(error instanceof Error ? error.message : "Local Office draft recovery is unavailable.");
    });
    return () => { cancelled = true; };
  }, []);

  function importFiles(incoming: FileList | File[]) {
    const selected = Array.from(incoming);
    const valid = selected.filter((file) => file.size <= maxFileSize);
    const oversized = selected.length - valid.length;
    if (files.length === 0 && valid.length > 0) setActiveIndex(0);
    setFiles((current) => [...current, ...valid.slice(0, Math.max(0, maxFiles - current.length))]);
    const acceptedCount = Math.min(valid.length, Math.max(0, maxFiles - files.length));
    if (oversized) setNotice(oversized + " file(s) skipped: the per-file limit is 20 MB.");
    else if (acceptedCount < valid.length) setNotice("Your workspace can hold up to " + maxFiles + " files at once.");
    else if (valid.length) setNotice(valid.length + " file(s) imported. You can switch between them in the editor.");
  }

  useEffect(() => {
    const documentId = new URLSearchParams(window.location.search).get("openCloudDocument");
    if (!documentId) return;
    let cancelled = false;
    void (async () => {
      try {
        setNotice("Opening your private cloud document…");
        const response = await fetch("/api/editor/documents/" + encodeURIComponent(documentId) + "/open", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not open this cloud document.");
        const [sourceResponse, currentResponse] = await Promise.all([fetch(payload.source.url), fetch(payload.current.url)]);
        if (!sourceResponse.ok || !currentResponse.ok) throw new Error("The private document download link expired. Try opening it again.");
        const [sourceBlob, currentBlob] = await Promise.all([sourceResponse.blob(), currentResponse.blob()]);
        const sourceFile = new File([sourceBlob], payload.source.name, { type: payload.source.mimeType });
        const currentFile = new File([currentBlob], payload.current.name, { type: payload.current.mimeType });
        const kind: "word" | "presentation" = payload.kind;
        const sessionId = await createOfficeSessionId(sourceFile, kind);
        await ensureOfficeDraftSession(sessionId, sourceFile, kind);
        await setOfficeCloudLink(sessionId, documentId, payload.parentRevisionId || null);
        if (cancelled) return;
        setFiles([currentFile]);
        setActiveIndex(0);
        setOfficeSessions(new Map([[currentFile, kind]]));
        setOfficeSessionIds(new Map([[currentFile, sessionId]]));
        setOfficeSourceFiles(new Map([[sessionId, sourceFile]]));
        setOfficeCloudLinks(new Map([[sessionId, { documentId, parentRevisionId: payload.parentRevisionId || null }]]));
        setEditing(true);
        setNotice("Opened cloud document · " + (payload.version ? "latest clean revision v" + payload.version : "original version") + ". Autosave and cloud history are connected.");
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("openCloudDocument");
        window.history.replaceState({}, "", cleanUrl.toString());
        void routeToFile(currentFile);
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "Cloud document could not be opened.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function onInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) importFiles(event.target.files);
    event.target.value = "";
  }
  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    importFiles(event.dataTransfer.files);
  }
  async function routeToFile(file: File) {
    const token = ++routeToken.current;
    const detected = detectDocumentFormat(new Uint8Array(await file.arrayBuffer()), file.name, file.type);
    if (detected.editor === "word" || detected.editor === "presentation") {
      const officeKind: "word" | "presentation" = detected.editor;
      setOfficeSessions((current) => {
        const next = new Map(current);
        next.set(file, officeKind);
        return next;
      });
    }
    if (token === routeToken.current) {
      setActiveEditorKind(detected.editor);
      setFormatWarning(detected.warning || "");
    }
    return detected;
  }
  function openEditor(tool: ToolId | null = null) {
    if (!files.length) {
      document.getElementById("file-picker")?.click();
      setNotice("Choose one or more files to open your workspace.");
      return;
    }
    setActiveTool(tool);
    setEditing(true);
    setShowTextPanel(tool === "annotate" || tool === "sign" ? tool : null);
    setNotice("");
    if (files[activeIndex]) void routeToFile(files[activeIndex]);
  }
  function chooseTool(id: ToolId) {
    const tool = tools.find((item) => item.id === id);
    if (!tool?.ready) return;
    if (id === "compress" || id === "convert" || id === "ocr") {
      setActiveAdvancedTool(id);
      if (files.length) {
        openEditor(id);
        setShowAdvanced(true);
      } else {
        document.getElementById("file-picker")?.click();
        setNotice("Choose a file to use " + tool.title + ".");
      }
      return;
    }
    if (!files.length) {
      setActiveTool(id);
      document.getElementById("file-picker")?.click();
      setNotice("Add a PDF file to use " + tool?.title + ".");
      return;
    }
    openEditor(id);
  }
  function updateActiveFile(next: File) {
    setFiles((current) => current.map((file, index) => index === activeIndex ? next : file));
    setNotice("Changes applied to " + next.name + ". Download when you’re ready.");
  }
  async function runPdfAction(action: "rotate" | "extract" | "annotate" | "sign" | "merge" | "split") {
    if (busy) return;
    if (action !== "merge" && (!activeFile || !isPdf(activeFile))) {
      setNotice("Select a PDF in the workspace first.");
      return;
    }
    setBusy(true);
    setNotice("Working locally in your browser…");
    try {
      if (action === "split" && activeFile) {
        const results = await splitPdf(activeFile);
        const resultFiles = results.map((result) => createPdfFile(result.bytes, result.filename));
        setFiles((current) => [...current, ...resultFiles]);
        setActiveIndex(files.length);
        setNotice("Split the document into " + resultFiles.length + " one-page PDFs.");
      } else if (action === "merge") {
        const merged = await mergePdfs(files);
        const resultFile = createPdfFile(merged.bytes, merged.filename);
        setFiles((current) => [...current, resultFile]);
        setActiveIndex(files.length);
        await routeToFile(resultFile);
        setNotice("Merged " + pdfFiles.length + " PDFs into one editable working document. Reorder or remove pages, review the result, then download when ready.");
      } else if (action === "rotate" && activeFile) {
        const result = await rotatePages(activeFile);
        updateActiveFile(createPdfFile(result.bytes, result.filename));
      } else if (action === "extract" && activeFile) {
        const result = await extractPages(activeFile, pageRange);
        const resultFile = createPdfFile(result.bytes, result.filename);
        setFiles((current) => [...current, resultFile]);
        setActiveIndex(files.length);
        setNotice("Extracted selected pages into " + resultFile.name + ".");
      } else if (action === "annotate" && activeFile) {
        const result = await addTextToPdf(activeFile, annotation, false);
        updateActiveFile(createPdfFile(result.bytes, result.filename));
        setShowTextPanel(null);
        setAnnotation("");
      } else if (action === "sign" && activeFile) {
        const result = await addTextToPdf(activeFile, signature, true);
        updateActiveFile(createPdfFile(result.bytes, result.filename));
        setShowTextPanel(null);
        setSignature("");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The PDF could not be processed. Try another file.");
    } finally {
      setBusy(false);
    }
  }

  function closeEditor() {
    setEditing(false);
    setShowTextPanel(null);
    setActiveTool(null);
    setActiveEditorKind("pdf");
    setFormatWarning("");
    setActiveAdvancedTool(null);
    setShowAdvanced(false);
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="site-header">
        <a className="brand" href="#" aria-label="PaperPilot home">
          <span className="brand-mark"><FileStack size={21} strokeWidth={2.2} /></span>
          <span>paper<span className="brand-accent">pilot</span><i>.</i></span>
        </a>
        <nav className={"nav-links " + (mobileMenu ? "nav-open" : "")}>
          <a className="nav-active" href="#tools" onClick={() => setMobileMenu(false)}>PDF tools</a>
          <a href="#workspace" onClick={() => setMobileMenu(false)}>Workspace</a>
          <a href="#how-it-works" onClick={() => setMobileMenu(false)}>How it works</a>
          <a href="#roadmap" onClick={() => setMobileMenu(false)}>Roadmap</a>
        </nav>
        <div className="header-actions">
          <a className="text-button" href="/account">My library</a><a className="text-button" href="/login">Sign in</a>
          <button className="header-cta" onClick={() => document.getElementById("upload-zone")?.scrollIntoView({ behavior: "smooth" })}>Get started <ArrowUpRight size={15} /></button>
        </div>
        <button className="mobile-menu-button" aria-label="Toggle navigation" onClick={() => setMobileMenu((value) => !value)}>{mobileMenu ? <X size={21} /> : <Menu size={21} />}</button>
      </header>

      <section className="hero-shell">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> YOUR DOCUMENTS, IN GOOD HANDS</div>
          <h1>Less paperwork.<br /><span>More possibility.</span></h1>
          <p className="hero-description">Edit PDFs, Word documents, presentations and images in one workspace. Convert, organize and keep your files moving.</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => document.getElementById("upload-zone")?.scrollIntoView({ behavior: "smooth" })}>Start with a file <ArrowRight size={17} /></button>
            <a className="quiet-link" href="#tools">Explore all tools <span>↓</span></a>
          </div>
          <div className="trust-row"><span><LockKeyhole size={14} /> Files stay on your device</span><span className="trust-divider" /><span><Zap size={14} /> No sign-up to get started</span></div>
        </div>
        <div className="hero-art" aria-label="Illustration of a document workspace">
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-spark spark-one">✦</div><div className="art-spark spark-two">✧</div>
          <div className="doc-shadow" />
          <div className="document-card">
            <div className="doc-top"><span className="doc-dot" /><span className="doc-dot" /><span className="doc-dot" /><span className="doc-label">PROJECT_BRIEF.PDF</span></div>
            <div className="doc-inner">
              <div className="doc-kicker">PAPERPILOT / DOCUMENT 01</div><div className="doc-title-line" /><div className="doc-title-line short" /><div className="doc-meta-line" />
              <div className="doc-chart"><div className="chart-bar bar-a" /><div className="chart-bar bar-b" /><div className="chart-bar bar-c" /><div className="chart-bar bar-d" /><div className="chart-bar bar-e" /></div>
              <div className="doc-text-line" /><div className="doc-text-line" /><div className="doc-text-line narrow" /><div className="doc-signature">paperpilot</div>
            </div>
          </div>
          <div className="float-chip chip-top"><span className="chip-icon chip-purple"><WandSparkles size={16} /></span><span><b>Ready to go</b><small>Your workspace is waiting</small></span><Check size={15} className="chip-check" /></div>
          <div className="float-chip chip-bottom"><span className="chip-icon chip-green"><ShieldCheck size={17} /></span><span><b>Private by design</b><small>Browser-side PDF tools</small></span></div>
        </div>
      </section>

      <section id="workspace" className="upload-section">
        <div className="section-heading"><div><div className="section-kicker">YOUR WORKSPACE</div><h2>What are we working on?</h2><p>Drop files to begin, or choose a tool below.</p></div><span className="local-pill"><span /> LOCAL PROCESSING</span></div>
        <div id="upload-zone" className={"upload-zone " + (dragging ? "upload-zone-active" : "")}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)} onDrop={onDrop}>
          <input className="sr-only" id="file-picker" type="file" accept={accepted} multiple onChange={onInput} />
          <div className="upload-icon"><CloudUpload size={27} /></div><h3>Drop your files here</h3>
          <p>or <label htmlFor="file-picker" className="browse-link">browse files</label> from your device</p>
          <div className="file-types"><span>PDF</span><span>DOCX</span><span>PPTX</span><span>JPG</span><span>PNG</span><small>Up to 20 MB per file · 12 files per workspace</small></div>
          <div className="upload-privacy"><LockKeyhole size={13} /> Available PDF edits run locally in your browser.</div>
        </div>
        {files.length > 0 && <div className="file-queue">
          <div className="queue-head"><div><b>{files.length} file{files.length > 1 ? "s" : ""} in your workspace</b><small>Files are ready for your next step</small></div><button className="clear-button" onClick={() => { setFiles([]); setActiveIndex(0); }}>Clear all <X size={13} /></button></div>
          <div className="queue-items">{files.map((file, index) => <div className="queue-file" key={file.name + file.lastModified + index}>
            <span className={"file-type-icon " + (isPdf(file) ? "pdf-icon" : "other-icon")}>{isPdf(file) ? <FileText size={18} /> : <FileImage size={18} />}</span>
            <span className="queue-file-name"><b>{file.name}</b><small>{formatBytes(file.size)} · {isPdf(file) ? "Ready for PDF tools" : file.type.startsWith("image/") ? "Ready for image conversion" : "Office conversion needs a connected worker"}</small></span>
            <button aria-label={"Remove " + file.name} className="icon-button" onClick={() => { setFiles((current) => current.filter((_, i) => i !== index)); setActiveIndex((current) => Math.max(0, current > index ? current - 1 : current === index ? 0 : current)); }}><X size={15} /></button>
          </div>)}</div>
          <div className="queue-actions"><button className="primary-button compact" onClick={() => openEditor()}>Open PDF workspace <ArrowRight size={16} /></button><CloudSaveButton files={files} /></div>
        </div>}
      </section>

      <section id="editors" className="tools-section" style={{ paddingTop: 12 }}>
        <div className="tools-heading">
          <div><div className="section-kicker">BUILT-IN DOCUMENT EDITORS</div><h2>Open the right studio for every file.</h2><p>Import a document and PaperPilot routes it to its matching editor automatically.</p></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
          {[
            { title: "PDF Studio", detail: "Preview pages, reorder, delete, rotate, annotate, sign, extract and export.", status: "AVAILABLE", tint: "#eaf4ff", icon: "PDF" },
            { title: "Word Studio", detail: "Edit DOCX documents in the built-in browser editor with local autosave and revisions.", status: "PILOT", tint: "#eaf0ff", icon: "DOCX" },
            { title: "Presentation Studio", detail: "Edit PPTX slides in the built-in browser editor with local autosave and revisions.", status: "PILOT", tint: "#fff1e8", icon: "PPTX" },
            { title: "Image Studio", detail: "Crop by resizing, rotate, flip, adjust brightness, contrast and saturation, then export.", status: "AVAILABLE", tint: "#e9f7ef", icon: "IMG" }
          ].map((studio) => <button key={studio.title} type="button" onClick={() => { document.getElementById("file-picker")?.click(); setNotice("Choose a " + studio.title.replace(" Studio", "") + " file. PaperPilot will detect its format and open the matching editor."); }} style={{ textAlign: "left", border: "1px solid #e5ece6", borderRadius: 13, padding: 18, background: "#fff", display: "flex", flexDirection: "column", gap: 12, minHeight: 166, boxShadow: "0 5px 18px rgba(32,65,43,.04)" }}>
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ display: "grid", placeItems: "center", width: 43, height: 36, borderRadius: 9, background: studio.tint, color: "#386e50", fontSize: 11, fontWeight: 850 }}>{studio.icon}</span>
              <span style={{ color: studio.status === "AVAILABLE" ? "#36815a" : "#9b7137", background: studio.status === "AVAILABLE" ? "#edf7f0" : "#fff6e8", borderRadius: 20, padding: "5px 8px", fontSize: 8, letterSpacing: .6, fontWeight: 850 }}>{studio.status}</span>
            </span>
            <span style={{ display: "grid", gap: 5 }}><b style={{ fontSize: 14, color: "#24382b" }}>{studio.title}</b><small style={{ fontSize: 11, lineHeight: 1.55, color: "#78857c" }}>{studio.detail}</small></span>
            <span style={{ color: "#347a55", fontSize: 10, fontWeight: 800 }}>Choose a file <ArrowRight size={13} style={{ verticalAlign: "middle" }} /></span>
          </button>)}
        </div>
        <p style={{ marginTop: 12, color: "#8b968e", fontSize: 10 }}>Word and Presentation editors remain pilot-only while full document round-trip and malware-scanning release checks are completed. Originals are preserved.</p>
      </section>

      <section id="tools" className="tools-section">
        <div className="tools-heading"><div><div className="section-kicker">THE TOOLKIT</div><h2>One place for every page.</h2><p>Small tasks, big projects — make every document work harder.</p></div>
          <div className="tool-search"><FileSearch size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a tool..." aria-label="Search tools" /></div>
        </div>
        <div className="tools-grid">{visibleTools.map((tool) => { const Icon = tool.icon; return <button className={"tool-card " + (!tool.ready ? "tool-disabled" : "")} key={tool.id} onClick={() => chooseTool(tool.id)}>
          <span className={"tool-icon " + tool.tint}><Icon size={21} strokeWidth={1.9} /></span><span className="tool-card-content"><b>{tool.title}</b><small>{tool.description}</small></span>
          {tool.label ? <span className="coming-label">{tool.label}</span> : <ArrowUpRight className="tool-arrow" size={17} />}
        </button>; })}</div>
        <div className="more-tools-note"><Sparkles size={16} /> PDF, image and OCR tools are available in-browser. Word and Presentation Studio are pilot integrations; private cloud history is available after sign-in.</div>
      </section>

      <section id="how-it-works" className="how-section">
        <div className="how-intro"><div className="section-kicker">MADE TO FEEL EFFORTLESS</div><h2>From file to finished.<br /><span>Without the fuss.</span></h2><p>PaperPilot keeps your everyday document tasks calm, quick and close at hand.</p></div>
        <div className="steps">
          <div className="step"><span className="step-num">01</span><span className="step-icon"><FolderOpen size={21} /></span><b>Bring your files</b><p>Drag in PDFs and other formats. Your browser handles the available PDF operations.</p></div>
          <div className="step"><span className="step-num">02</span><span className="step-icon"><WandSparkles size={21} /></span><b>Make your move</b><p>Merge, split, rotate, annotate or add a signature in the browser.</p></div>
          <div className="step"><span className="step-num">03</span><span className="step-icon"><ArrowDownToLine size={21} /></span><b>Take it with you</b><p>Download your updated PDF when you’re happy with the result.</p></div>
        </div>
      </section>

      <section id="roadmap" className="roadmap-section"><div className="roadmap-card">
        <div className="roadmap-copy"><div className="section-kicker">THE PAPERPILOT PROMISE</div><h2>A little less admin.<br /><span>A lot more momentum.</span></h2><p>Your document workspace is taking shape: PDF and image editing, OCR, account-backed cloud history, and built-in Word and Presentation studios.</p><button className="light-button" onClick={() => setNotice("Thanks for exploring PaperPilot. More tools are being built.")}>Explore the roadmap <ArrowRight size={16} /></button></div>
        <div className="roadmap-list"><div><span className="roadmap-check"><Check size={14} /></span><span><b>PDF & image editors</b><small>Page workspace and Image Studio</small></span><span className="roadmap-tag">AVAILABLE</span></div><div><span className="roadmap-number">02</span><span><b>Word & Presentation Studio</b><small>Built-in DOCX and PPTX editors</small></span><span className="roadmap-tag">PILOT</span></div><div><span className="roadmap-number">03</span><span><b>OCR & smart documents</b><small>Text recognition and searchable PDF export</small></span><span className="roadmap-tag">AVAILABLE</span></div><div><span className="roadmap-number">04</span><span><b>Private cloud workspace</b><small>Sign-in, document library and revision history</small></span><span className="roadmap-tag">AVAILABLE</span></div><div><span className="roadmap-number">05</span><span><b>Team workspaces</b><small>Shared projects and collaboration controls</small></span><span className="roadmap-tag">PLANNED</span></div></div>
      </div></section>

      <footer className="site-footer"><a className="brand footer-brand" href="#"><span className="brand-mark"><FileStack size={18} /></span><span>paper<span className="brand-accent">pilot</span><i>.</i></span></a><span>Thoughtful tools for the documents that move you.</span><span>© 2026 PaperPilot</span></footer>

      {showAdvanced && activeAdvancedTool && <AdvancedToolDialog
        tool={activeAdvancedTool}
        files={files}
        onClose={() => { setShowAdvanced(false); setActiveAdvancedTool(null); }}
        onResult={(result) => {
          const outputs = Array.isArray(result) ? result : [result];
          setShowAdvanced(false);
          setActiveAdvancedTool(null);
          setFiles((current) => [...current, ...outputs]);
          setActiveIndex(files.length + outputs.length - 1);
          void routeToFile(outputs[outputs.length - 1]);
        }}
      />}

      {notice && <div className="toast" role="status"><span><Check size={15} /></span>{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={15} /></button></div>}

      {editing && <div className="editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) closeEditor(); }}>
        <section className="editor-modal" role="dialog" aria-modal="true" aria-label={"PaperPilot " + editorLabel(activeEditorKind)}>
          <header className="editor-header">
            <div className="editor-brand"><span className="brand-mark"><FileStack size={18} /></span><b>PaperPilot <span>/ {editorLabel(activeEditorKind)}</span></b></div>
            <div className="editor-header-actions">
              <label className="import-button" htmlFor="editor-file-picker"><Plus size={15} /> Import files</label>
              <input className="sr-only" id="editor-file-picker" type="file" accept={accepted} multiple onChange={onInput} />
              <span className="editor-local"><LockKeyhole size={12} /> Local session</span>
              <button className="icon-button editor-close" aria-label="Close editor" onClick={closeEditor}><X size={19} /></button>
            </div>
          </header>
          <div className="editor-body">
            <aside className="editor-sidebar">
              <div className="sidebar-title"><span>WORKSPACE FILES</span><span>{files.length}</span></div>
              <div className="editor-file-list">{files.map((file, index) => <button className={"editor-file " + (index === activeIndex ? "editor-file-active" : "")} key={file.name + file.lastModified + index} onClick={() => { setActiveIndex(index); setShowTextPanel(null); void routeToFile(file); }}>
                <span className={"file-type-icon " + (isPdf(file) ? "pdf-icon" : "other-icon")}>{isPdf(file) ? <FileText size={17} /> : <FileImage size={17} />}</span>
                <span><b>{file.name}</b><small>{formatBytes(file.size)}</small></span>
                {index === activeIndex && <span className="active-dot" />}
              </button>)}</div>
              <label className="sidebar-import" htmlFor="editor-file-picker"><Plus size={15} /> Add another file</label>
              <div className="sidebar-tip"><ShieldCheck size={16} /><span><b>Private workspace</b><small>Files stay in this browser session.</small></span></div>
            </aside>
            <div className="editor-main">
              <div className="editor-toolbar">
                <div className="editor-document-title"><FileText size={16} /><span>{activeFile?.name ?? "No file selected"}</span></div>
                <div className="editor-actions">
                  <button onClick={() => runPdfAction("rotate")} disabled={busy || !activeFile || !isPdf(activeFile)}><RotateCw size={15} /><span>Rotate</span></button>
                  <button onClick={() => setShowTextPanel("annotate")} disabled={busy || !activeFile || !isPdf(activeFile)}><PenLine size={15} /><span>Text note</span></button>
                  <button onClick={() => setShowTextPanel("sign")} disabled={busy || !activeFile || !isPdf(activeFile)}><Signature size={15} /><span>Sign</span></button>
                  <button className="download-action" onClick={() => activeFile && makeDownload(activeFile)} disabled={!activeFile || activeEditorKind === "word" || activeEditorKind === "presentation"}><Download size={15} /><span>Download</span></button>
                </div>
              </div>
              {showTextPanel && <div className="edit-inline-panel"><div><b>{showTextPanel === "sign" ? "Add a signature" : "Add a text note"}</b><small>{showTextPanel === "sign" ? "A typed signature will be placed on the first page." : "Your note will be placed near the top of the first page."}</small></div>
                <input value={showTextPanel === "sign" ? signature : annotation} onChange={(event) => showTextPanel === "sign" ? setSignature(event.target.value) : setAnnotation(event.target.value)} placeholder={showTextPanel === "sign" ? "Your full name" : "Write your note"} />
                <button className="small-primary" disabled={busy} onClick={() => runPdfAction(showTextPanel)}>{busy ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />} Apply</button>
                <button className="panel-dismiss" aria-label="Close input panel" onClick={() => setShowTextPanel(null)}><X size={15} /></button>
              </div>}
              <div className="preview-stage" style={{ position: "relative" }}>
                {busy && <div className="processing-shade"><LoaderCircle className="spin" size={26} /><b>Updating your document</b><small>Processing locally in your browser</small></div>}
                {activeFile && activeEditorKind === "pdf" && isPdf(activeFile) ? <PdfPageWorkspace file={activeFile} onChange={updateActiveFile} /> : activeFile && activeEditorKind === "image" ? <ImageStudio key={activeIndex} file={activeFile} onResult={(result) => { setFiles((current) => [...current, result]); setActiveIndex(files.length); void routeToFile(result); setNotice("Image edits exported as a new revision. The original remains unchanged."); }} /> : activeFile && (activeEditorKind === "word" || activeEditorKind === "presentation") && officeSessions.get(activeFile) === activeEditorKind ? null : <div className="empty-preview">
                  <div className="empty-preview-icon">{activeFile ? <ImageIcon size={28} /> : <FileStack size={28} />}</div>
                  <h3>{activeFile ? (activeEditorKind === "unsupported" ? "Unsupported document format" : editorLabel(activeEditorKind) + " is selected") : "Your canvas is ready"}</h3>
                  <p>{activeFile ? (formatWarning || (activeEditorKind === "word" ? "Word Studio is opening this document. The original remains unchanged." : activeEditorKind === "presentation" ? "Presentation Studio is opening this deck. The original remains unchanged." : activeEditorKind === "image" ? "Image Studio is opening this image. The original remains unchanged." : activeEditorKind === "pdf" ? "This file could not be opened as a PDF. The original remains unchanged." : "This file cannot safely be opened in an editor.")) : "Import a document to begin."}</p>
                  <label className="primary-button compact" htmlFor="editor-file-picker"><Upload size={15} /> Import files</label>
                </div>}
                {Array.from(officeSessions.entries()).filter(([sessionFile]) => files.includes(sessionFile)).map(([sessionFile, kind]) => {
                  const activeSession = sessionFile === activeFile && kind === activeEditorKind;
                  const sessionId = officeSessionIds.get(sessionFile);
                  const cloudLink = sessionId ? officeCloudLinks.get(sessionId) : undefined;
                  const sourceFile = sessionId ? officeSourceFiles.get(sessionId) : undefined;
                  return <div key={officeSessionIds.get(sessionFile) ?? (sessionFile.name + sessionFile.lastModified + files.indexOf(sessionFile))} style={{ position: "absolute", inset: 0, visibility: activeSession ? "visible" : "hidden", pointerEvents: activeSession ? "auto" : "none", zIndex: activeSession ? 2 : 1 }}>
                    <OfficeStudio
                      file={sessionFile}
                      sourceFile={sourceFile}
                      kind={kind}
                      sessionId={sessionId}
                      cloudDocumentId={cloudLink?.documentId}
                      parentRevisionId={cloudLink?.parentRevisionId}
                      onSessionReady={(id, original) => {
                        setOfficeSessionIds((current) => new Map(current).set(sessionFile, id));
                        setOfficeSourceFiles((current) => new Map(current).set(id, original));
                      }}
                      onCloudLink={(id, documentId, parentRevisionId) => {
                        setOfficeCloudLinks((current) => new Map(current).set(id, { documentId, parentRevisionId }));
                      }}
                      onSave={(revision, meta) => {
                        setFiles((current) => {
                          let index = current.indexOf(sessionFile);
                          if (index < 0) index = current.findIndex((candidate) => officeSessionIds.get(candidate) === meta.sessionId);
                          if (index < 0) return [...current, revision];
                          const nextFiles = [...current];
                          nextFiles[index] = revision;
                          return nextFiles;
                        });
                        setOfficeSessions((current) => new Map(current).set(revision, kind));
                        setOfficeSessionIds((current) => new Map(current).set(revision, meta.sessionId));
                        setOfficeSourceFiles((current) => new Map(current).set(meta.sessionId, sourceFile ?? sessionFile));
                        if (activeSession) void routeToFile(revision);
                        setNotice("Autosaved " + revision.name + " locally as revision " + meta.version + ".");
                      }}
                      onRestore={(revision, meta) => {
                        setFiles((current) => {
                          const index = current.indexOf(sessionFile);
                          if (index < 0) return current;
                          const nextFiles = [...current];
                          nextFiles[index] = revision;
                          return nextFiles;
                        });
                        setOfficeSessions((current) => new Map(current).set(revision, kind));
                        setOfficeSessionIds((current) => new Map(current).set(revision, meta.sessionId));
                        setOfficeSourceFiles((current) => new Map(current).set(meta.sessionId, sourceFile ?? sessionFile));
                        if (activeSession) void routeToFile(revision);
                      }}
                    />
                  </div>;
                })}
              </div>
              <div className="editor-bottom-bar">
                <span><span className="status-dot" /> {activeFile ? editorLabel(activeEditorKind) + (activeEditorKind === "pdf" ? " · temporary working copy" : " selected") : "Waiting for a file"}</span>
                <div className="bottom-actions">
                  <>{activeTool === "split" && <button onClick={() => runPdfAction("split")} disabled={busy || !activeFile || !isPdf(activeFile)}><Scissors size={14} /> Split into pages</button>}<button onClick={() => runPdfAction("merge")} disabled={busy || pdfFiles.length < 2}><Combine size={14} /> Merge {pdfFiles.length > 0 ? "PDFs (" + pdfFiles.length + ")" : "PDFs"}</button></>
                  <div className="range-control"><span>Pages</span><input value={pageRange} onChange={(event) => setPageRange(event.target.value)} aria-label="Page range to extract" placeholder="1, 3-5" /><button onClick={() => runPdfAction("extract")} disabled={busy || !activeFile || !isPdf(activeFile)}>Extract</button></div>
                </div>
              </div>
              <div className="editor-status">{notice || (activeFile ? "Tip: import another PDF at any time to add it to this editing session." : "Import a PDF to begin.")}</div>
            </div>
          </div>
        </section>
      </div>}
    </main>
  );
}
