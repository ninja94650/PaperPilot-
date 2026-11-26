"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  RotateCw,
  Scissors,
  FileArchive,
  PenLine,
  Signature as SignatureIcon,
  Stamp,
  Binary,
  Download,
  CloudUpload,
  Plus,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Check,
  LoaderCircle,
  FileText,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Layers,
  Sparkles,
  Eraser
} from "lucide-react";
import { WorkspaceDocument, ToolId } from "@/lib/types";
import {
  rotatePages,
  deletePages,
  duplicatePage,
  reorderPages,
  splitPdf,
  addTextToPdf,
  embedSignatureImage,
  addWatermarkToPdf,
  addPageNumbers,
  optimizePdf,
  getPdfInfo
} from "@/lib/pdf-tools";

interface DocumentEditorProps {
  document: WorkspaceDocument;
  onClose: () => void;
  onUpdateDocument: (docId: string, nextFile: File, nextBlobUrl: string) => void;
  autosaveStatus?: string;
  onSaveToCloud?: (file: File) => Promise<void>;
  initialTool?: ToolId;
}

export default function DocumentEditor({
  document: initialDoc,
  onClose,
  onUpdateDocument,
  autosaveStatus,
  onSaveToCloud,
  initialTool,
}: DocumentEditorProps) {
  const [doc, setDoc] = useState<WorkspaceDocument>(initialDoc);
  const [isBusy, setIsBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const [activePage, setActivePage] = useState(0);
  const [pageCount, setPageCount] = useState(initialDoc.pageCount || 1);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [previewKey, setPreviewKey] = useState(1);

  // Modals and panels
  const [activePanel, setActivePanel] = useState<
    "none" | "annotate" | "sign" | "watermark" | "page-numbers" | "compress"
  >(initialTool === "annotate" ? "annotate" : initialTool === "sign" ? "sign" : "none");

  // Annotate state
  const [annotationText, setAnnotationText] = useState("");
  const [annotationColor, setAnnotationColor] = useState<"dark" | "blue" | "red">("dark");
  const [annotationSize, setAnnotationSize] = useState(14);

  // Sign state
  const [signMode, setSignMode] = useState<"draw" | "type">("draw");
  const [typedSignName, setTypedSignName] = useState("");
  const [typedSignStyle, setTypedSignStyle] = useState<"script" | "formal" | "casual">("script");
  const [signColor, setSignColor] = useState("#1e3a8a");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Watermark state
  const [watermarkText, setWatermarkText] = useState("CONFIDENTIAL");
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.18);
  const [watermarkAngle, setWatermarkAngle] = useState(45);

  // Page numbering position
  const [pageNumberPos, setPageNumberPos] = useState<"bottom-center" | "bottom-right" | "top-right">("bottom-center");

  // Compression level
  const [compressLevel, setCompressLevel] = useState<"extreme" | "recommended" | "low">("recommended");

  // Keep preview URL updated
  useEffect(() => {
    if (doc.file) {
      getPdfInfo(doc.file)
        .then((info) => {
          setPageCount(info.pageCount);
        })
        .catch(() => {});
    }
  }, [doc.file]);

  // Setup drawing canvas
  useEffect(() => {
    if (activePanel === "sign" && signMode === "draw") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = signColor;
    }
  }, [activePanel, signMode, signColor]);

  function clearDrawingCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  function startDrawing(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsDrawing(true);
    setHasDrawn(true);

    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  }

  function stopDrawing() {
    setIsDrawing(false);
  }

  async function applyFileChange(bytes: Uint8Array, filename: string) {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const updatedFile = new File([buffer], filename, { type: "application/pdf" });
    const nextBlobUrl = URL.createObjectURL(updatedFile);

    const updatedDoc: WorkspaceDocument = {
      ...doc,
      file: updatedFile,
      blobUrl: nextBlobUrl,
      size: updatedFile.size,
      updatedAt: Date.now(),
    };

    setDoc(updatedDoc);
    onUpdateDocument(doc.id, updatedFile, nextBlobUrl);
    setPreviewKey((k) => k + 1);
  }

  // --- ACTIONS ---

  async function handleRotateAll() {
    if (!doc.file || isBusy) return;
    setIsBusy(true);
    setBusyMessage("Rotating document pages...");
    try {
      const result = await rotatePages(doc.file, undefined, 90);
      await applyFileChange(result.bytes, doc.name);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Rotate failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRotateSinglePage(pageIdx: number) {
    if (!doc.file || isBusy) return;
    setIsBusy(true);
    setBusyMessage(`Rotating page ${pageIdx + 1}...`);
    try {
      const result = await rotatePages(doc.file, [pageIdx], 90);
      await applyFileChange(result.bytes, doc.name);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Page rotate failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeletePage(pageIdx: number) {
    if (!doc.file || isBusy) return;
    if (pageCount <= 1) {
      alert("A document must retain at least one page.");
      return;
    }
    if (!confirm(`Delete page ${pageIdx + 1}?`)) return;

    setIsBusy(true);
    setBusyMessage(`Deleting page ${pageIdx + 1}...`);
    try {
      const result = await deletePages(doc.file, [pageIdx]);
      await applyFileChange(result.bytes, doc.name);
      setActivePage((prev) => Math.max(0, Math.min(prev, result.pageCount! - 1)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete page failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDuplicatePage(pageIdx: number) {
    if (!doc.file || isBusy) return;
    setIsBusy(true);
    setBusyMessage(`Duplicating page ${pageIdx + 1}...`);
    try {
      const result = await duplicatePage(doc.file, pageIdx);
      await applyFileChange(result.bytes, doc.name);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Duplicate page failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleMovePage(pageIdx: number, direction: "up" | "down") {
    if (!doc.file || isBusy) return;
    const targetIdx = direction === "up" ? pageIdx - 1 : pageIdx + 1;
    if (targetIdx < 0 || targetIdx >= pageCount) return;

    setIsBusy(true);
    setBusyMessage("Reordering pages...");
    try {
      const order = Array.from({ length: pageCount }, (_, i) => i);
      const temp = order[pageIdx];
      order[pageIdx] = order[targetIdx];
      order[targetIdx] = temp;

      const result = await reorderPages(doc.file, order);
      await applyFileChange(result.bytes, doc.name);
      setActivePage(targetIdx);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Reorder failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleApplyAnnotation() {
    if (!doc.file || !annotationText.trim() || isBusy) return;
    setIsBusy(true);
    setBusyMessage("Adding text annotation...");
    try {
      const colorMap = {
        dark: { r: 0.1, g: 0.15, b: 0.28 },
        blue: { r: 0.15, g: 0.35, b: 0.8 },
        red: { r: 0.8, g: 0.2, b: 0.2 },
      };
      const result = await addTextToPdf(doc.file, annotationText, false, {
        pageIndex: activePage,
        fontSize: annotationSize,
        color: colorMap[annotationColor],
      });
      await applyFileChange(result.bytes, doc.name);
      setActivePanel("none");
      setAnnotationText("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Annotation failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleApplySignature() {
    if (!doc.file || isBusy) return;
    setIsBusy(true);
    setBusyMessage("Embedding signature onto page...");
    try {
      if (signMode === "draw") {
        const canvas = canvasRef.current;
        if (!canvas || !hasDrawn) {
          throw new Error("Please draw a signature on the canvas first.");
        }
        const dataUrl = canvas.toDataURL("image/png");
        const result = await embedSignatureImage(doc.file, dataUrl, {
          pageIndex: activePage,
          width: 170,
        });
        await applyFileChange(result.bytes, doc.name);
      } else {
        if (!typedSignName.trim()) {
          throw new Error("Please type your signature name.");
        }
        const result = await addTextToPdf(doc.file, typedSignName, true, {
          pageIndex: activePage,
          fontSize: 24,
        });
        await applyFileChange(result.bytes, doc.name);
      }
      setActivePanel("none");
      clearDrawingCanvas();
      setTypedSignName("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Signature failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleApplyWatermark() {
    if (!doc.file || !watermarkText.trim() || isBusy) return;
    setIsBusy(true);
    setBusyMessage("Applying watermark across document...");
    try {
      const result = await addWatermarkToPdf(doc.file, watermarkText, {
        opacity: watermarkOpacity,
        angle: watermarkAngle,
      });
      await applyFileChange(result.bytes, doc.name);
      setActivePanel("none");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Watermark failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleApplyPageNumbers() {
    if (!doc.file || isBusy) return;
    setIsBusy(true);
    setBusyMessage("Adding page numbers...");
    try {
      const result = await addPageNumbers(doc.file, pageNumberPos);
      await applyFileChange(result.bytes, doc.name);
      setActivePanel("none");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Page numbers failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleApplyCompression() {
    if (!doc.file || isBusy) return;
    setIsBusy(true);
    setBusyMessage("Optimizing document structure...");
    try {
      const result = await optimizePdf(doc.file, compressLevel);
      await applyFileChange(result.bytes, doc.name);
      setActivePanel("none");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Optimization failed");
    } finally {
      setIsBusy(false);
    }
  }

  function handleDownload() {
    if (!doc.file) return;
    const url = URL.createObjectURL(doc.file);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="editor-overlay-backdrop" role="dialog" aria-modal="true">
      <div className="editor-window">
        {/* Top Header Bar */}
        <header className="editor-nav-bar">
          <div className="editor-left-meta">
            <span className="editor-brand-badge">
              <FileText size={16} />
            </span>
            <div className="editor-file-title-wrap">
              <span className="editor-file-title">{doc.name}</span>
              <span className="editor-file-sub">
                {pageCount} page{pageCount > 1 ? "s" : ""} · {(doc.size / 1024).toFixed(0)} KB
              </span>
            </div>
            {autosaveStatus && (
              <span className="editor-autosave-badge">
                <Check size={12} /> {autosaveStatus}
              </span>
            )}
          </div>

          <div className="editor-center-tools">
            <button
              type="button"
              className="editor-tool-btn"
              onClick={handleRotateAll}
              disabled={isBusy}
              title="Rotate all pages 90°"
            >
              <RotateCw size={15} />
              <span>Rotate</span>
            </button>
            <button
              type="button"
              className={`editor-tool-btn ${activePanel === "annotate" ? "active" : ""}`}
              onClick={() => setActivePanel((p) => (p === "annotate" ? "none" : "annotate"))}
              disabled={isBusy}
              title="Add text note"
            >
              <PenLine size={15} />
              <span>Annotate</span>
            </button>
            <button
              type="button"
              className={`editor-tool-btn ${activePanel === "sign" ? "active" : ""}`}
              onClick={() => setActivePanel((p) => (p === "sign" ? "none" : "sign"))}
              disabled={isBusy}
              title="Place signature"
            >
              <SignatureIcon size={15} />
              <span>Sign</span>
            </button>
            <button
              type="button"
              className={`editor-tool-btn ${activePanel === "watermark" ? "active" : ""}`}
              onClick={() => setActivePanel((p) => (p === "watermark" ? "none" : "watermark"))}
              disabled={isBusy}
              title="Add watermark"
            >
              <Stamp size={15} />
              <span>Watermark</span>
            </button>
            <button
              type="button"
              className={`editor-tool-btn ${activePanel === "page-numbers" ? "active" : ""}`}
              onClick={() => setActivePanel((p) => (p === "page-numbers" ? "none" : "page-numbers"))}
              disabled={isBusy}
              title="Add page numbers"
            >
              <Binary size={15} />
              <span>Numbers</span>
            </button>
            <button
              type="button"
              className={`editor-tool-btn ${activePanel === "compress" ? "active" : ""}`}
              onClick={() => setActivePanel((p) => (p === "compress" ? "none" : "compress"))}
              disabled={isBusy}
              title="Optimize document"
            >
              <FileArchive size={15} />
              <span>Optimize</span>
            </button>
          </div>

          <div className="editor-right-actions">
            {onSaveToCloud && doc.file && (
              <button
                type="button"
                className="editor-cloud-save-btn"
                onClick={() => onSaveToCloud(doc.file!)}
                disabled={isBusy}
              >
                <CloudUpload size={14} />
                <span>Cloud</span>
              </button>
            )}
            <button
              type="button"
              className="editor-download-btn"
              onClick={handleDownload}
              title="Download file to device"
            >
              <Download size={14} />
              <span>Download</span>
            </button>
            <button
              type="button"
              className="editor-close-icon-btn"
              onClick={onClose}
              title="Close editor"
              aria-label="Close editor"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Dynamic Tool Sub-Panel */}
        {activePanel === "annotate" && (
          <div className="editor-subpanel">
            <div className="subpanel-header">
              <b>Add Text Note to Page {activePage + 1}</b>
              <small>Positioned near the top of the selected page.</small>
            </div>
            <input
              type="text"
              className="subpanel-input"
              placeholder="Enter note or approval text..."
              value={annotationText}
              onChange={(e) => setAnnotationText(e.target.value)}
              autoFocus
            />
            <div className="subpanel-options">
              <span className="option-label">Color:</span>
              <button
                type="button"
                className={`color-dot dot-dark ${annotationColor === "dark" ? "active" : ""}`}
                onClick={() => setAnnotationColor("dark")}
              />
              <button
                type="button"
                className={`color-dot dot-blue ${annotationColor === "blue" ? "active" : ""}`}
                onClick={() => setAnnotationColor("blue")}
              />
              <button
                type="button"
                className={`color-dot dot-red ${annotationColor === "red" ? "active" : ""}`}
                onClick={() => setAnnotationColor("red")}
              />
            </div>
            <button
              type="button"
              className="subpanel-apply-btn"
              onClick={handleApplyAnnotation}
              disabled={!annotationText.trim() || isBusy}
            >
              <Check size={14} /> Apply Note
            </button>
            <button
              type="button"
              className="subpanel-cancel-btn"
              onClick={() => setActivePanel("none")}
            >
              Cancel
            </button>
          </div>
        )}

        {activePanel === "sign" && (
          <div className="editor-subpanel sign-subpanel">
            <div className="sign-panel-top">
              <div className="sign-tab-group">
                <button
                  type="button"
                  className={`sign-tab ${signMode === "draw" ? "active" : ""}`}
                  onClick={() => setSignMode("draw")}
                >
                  Draw Signature
                </button>
                <button
                  type="button"
                  className={`sign-tab ${signMode === "type" ? "active" : ""}`}
                  onClick={() => setSignMode("type")}
                >
                  Type Signature
                </button>
              </div>
              <button
                type="button"
                className="subpanel-cancel-btn"
                onClick={() => setActivePanel("none")}
              >
                <X size={14} />
              </button>
            </div>

            {signMode === "draw" ? (
              <div className="signature-draw-area">
                <div className="canvas-wrap">
                  <canvas
                    ref={canvasRef}
                    width={480}
                    height={160}
                    className="signature-canvas"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                  {!hasDrawn && (
                    <span className="canvas-placeholder-text">
                      Sign here using mouse or touch...
                    </span>
                  )}
                </div>
                <div className="signature-canvas-footer">
                  <div className="canvas-colors">
                    <button
                      type="button"
                      className={`color-dot dot-blue ${signColor === "#1e3a8a" ? "active" : ""}`}
                      onClick={() => setSignColor("#1e3a8a")}
                      title="Navy Blue"
                    />
                    <button
                      type="button"
                      className={`color-dot dot-dark ${signColor === "#0f172a" ? "active" : ""}`}
                      onClick={() => setSignColor("#0f172a")}
                      title="Charcoal"
                    />
                    <button
                      type="button"
                      className={`color-dot dot-purple ${signColor === "#6d28d9" ? "active" : ""}`}
                      onClick={() => setSignColor("#6d28d9")}
                      title="Royal Violet"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={clearDrawingCanvas}
                    className="canvas-clear-btn"
                  >
                    <Eraser size={13} /> Clear
                  </button>
                  <button
                    type="button"
                    onClick={handleApplySignature}
                    disabled={!hasDrawn || isBusy}
                    className="subpanel-apply-btn"
                  >
                    <Check size={14} /> Apply to Page {activePage + 1}
                  </button>
                </div>
              </div>
            ) : (
              <div className="signature-type-area">
                <input
                  type="text"
                  className="subpanel-input sign-type-input"
                  placeholder="Type your full legal name..."
                  value={typedSignName}
                  onChange={(e) => setTypedSignName(e.target.value)}
                  autoFocus
                />
                {typedSignName && (
                  <div className="typed-sign-preview-box">
                    <span className="cursive-preview-text">{typedSignName}</span>
                  </div>
                )}
                <div className="signature-canvas-footer">
                  <button
                    type="button"
                    onClick={handleApplySignature}
                    disabled={!typedSignName.trim() || isBusy}
                    className="subpanel-apply-btn"
                  >
                    <Check size={14} /> Place Signature
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activePanel === "watermark" && (
          <div className="editor-subpanel">
            <div className="subpanel-header">
              <b>Add Diagonal Watermark</b>
              <small>Applies diagonally across all pages.</small>
            </div>
            <input
              type="text"
              className="subpanel-input"
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              placeholder="e.g. CONFIDENTIAL, DRAFT"
            />
            <div className="subpanel-range-control">
              <span>Opacity: {Math.round(watermarkOpacity * 100)}%</span>
              <input
                type="range"
                min="0.05"
                max="0.6"
                step="0.05"
                value={watermarkOpacity}
                onChange={(e) => setWatermarkOpacity(parseFloat(e.target.value))}
              />
            </div>
            <button
              type="button"
              className="subpanel-apply-btn"
              onClick={handleApplyWatermark}
              disabled={!watermarkText.trim() || isBusy}
            >
              <Check size={14} /> Apply Watermark
            </button>
            <button
              type="button"
              className="subpanel-cancel-btn"
              onClick={() => setActivePanel("none")}
            >
              Cancel
            </button>
          </div>
        )}

        {activePanel === "page-numbers" && (
          <div className="editor-subpanel">
            <div className="subpanel-header">
              <b>Add Page Numbers</b>
              <small>Format: &ldquo;Page X of Y&rdquo;</small>
            </div>
            <select
              className="subpanel-select"
              value={pageNumberPos}
              onChange={(e) => setPageNumberPos(e.target.value as any)}
            >
              <option value="bottom-center">Bottom Center</option>
              <option value="bottom-right">Bottom Right</option>
              <option value="top-right">Top Right</option>
            </select>
            <button
              type="button"
              className="subpanel-apply-btn"
              onClick={handleApplyPageNumbers}
              disabled={isBusy}
            >
              <Check size={14} /> Number Pages
            </button>
            <button
              type="button"
              className="subpanel-cancel-btn"
              onClick={() => setActivePanel("none")}
            >
              Cancel
            </button>
          </div>
        )}

        {activePanel === "compress" && (
          <div className="editor-subpanel">
            <div className="subpanel-header">
              <b>Universal Optimizer Preset</b>
              <small>Repacks PDF streams and trims duplicate objects.</small>
            </div>
            <select
              className="subpanel-select"
              value={compressLevel}
              onChange={(e) => setCompressLevel(e.target.value as any)}
            >
              <option value="recommended">Recommended (Balanced web & print)</option>
              <option value="extreme">Extreme (Maximum size reduction)</option>
              <option value="low">Low (Lossless cleanup)</option>
            </select>
            <button
              type="button"
              className="subpanel-apply-btn"
              onClick={handleApplyCompression}
              disabled={isBusy}
            >
              <Check size={14} /> Optimize Now
            </button>
            <button
              type="button"
              className="subpanel-cancel-btn"
              onClick={() => setActivePanel("none")}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Main Workspace Body */}
        <div className="editor-body-layout">
          {/* Left: Page Thumbnails & Reorder Strip */}
          <aside className="editor-page-strip">
            <div className="page-strip-title">
              <span>PAGES</span>
              <span className="strip-count-badge">{pageCount}</span>
            </div>

            <div className="page-thumbnails-list">
              {Array.from({ length: pageCount }, (_, idx) => {
                const isCurrent = idx === activePage;
                return (
                  <div
                    key={idx}
                    className={`page-thumb-card ${isCurrent ? "current-page" : ""}`}
                    onClick={() => setActivePage(idx)}
                  >
                    <div className="page-thumb-top">
                      <span className="page-num-pill">Page {idx + 1}</span>
                      <div className="page-actions-group">
                        <button
                          type="button"
                          className="page-mini-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRotateSinglePage(idx);
                          }}
                          title="Rotate 90°"
                        >
                          <RotateCw size={12} />
                        </button>
                        <button
                          type="button"
                          className="page-mini-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicatePage(idx);
                          }}
                          title="Duplicate page"
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          type="button"
                          className="page-mini-action danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePage(idx);
                          }}
                          title="Delete page"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Miniature Page Representation */}
                    <div className="page-thumb-preview-box">
                      <div className="mini-doc-lines">
                        <div className="mini-line-heading" />
                        <div className="mini-line" />
                        <div className="mini-line" />
                        <div className="mini-line short" />
                      </div>
                    </div>

                    {/* Reorder Up / Down Controls */}
                    <div className="page-reorder-bar">
                      <button
                        type="button"
                        disabled={idx === 0 || isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMovePage(idx, "up");
                        }}
                        className="reorder-arrow-btn"
                        title="Move Up"
                      >
                        <ArrowUp size={11} />
                      </button>
                      <button
                        type="button"
                        disabled={idx === pageCount - 1 || isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMovePage(idx, "down");
                        }}
                        className="reorder-arrow-btn"
                        title="Move Down"
                      >
                        <ArrowDown size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Center Stage: Document Viewer */}
          <main className="editor-center-stage">
            {isBusy && (
              <div className="editor-processing-overlay">
                <LoaderCircle size={32} className="spin-fast" />
                <b>{busyMessage || "Applying document updates..."}</b>
                <small>Processed instantly in your browser session.</small>
              </div>
            )}

            <div className="editor-canvas-container">
              {doc.blobUrl ? (
                <iframe
                  key={`${doc.blobUrl}-${previewKey}`}
                  src={`${doc.blobUrl}#page=${activePage + 1}&zoom=${zoomLevel}&toolbar=1&navpanes=0`}
                  className="editor-pdf-frame"
                  title="PDF Preview"
                />
              ) : (
                <div className="editor-empty-canvas">
                  <FileText size={48} className="empty-canvas-icon" />
                  <h3>Document Ready for Editing</h3>
                  <p>Choose an action from the top toolbar to begin.</p>
                </div>
              )}
            </div>
          </main>
        </div>

        {/* Bottom Status Bar */}
        <footer className="editor-status-bar">
          <div className="status-left">
            <span className="status-bullet" />
            <span className="status-text">
              Page {activePage + 1} of {pageCount} · {doc.name}
            </span>
          </div>

          <div className="status-center-zoom">
            <button
              type="button"
              className="zoom-btn"
              onClick={() => setZoomLevel((z) => Math.max(50, z - 25))}
              title="Zoom out"
            >
              <ZoomOut size={13} />
            </button>
            <span className="zoom-value">{zoomLevel}%</span>
            <button
              type="button"
              className="zoom-btn"
              onClick={() => setZoomLevel((z) => Math.min(200, z + 25))}
              title="Zoom in"
            >
              <ZoomIn size={13} />
            </button>
            <button
              type="button"
              className="zoom-reset-btn"
              onClick={() => setZoomLevel(100)}
            >
              Reset
            </button>
          </div>

          <div className="status-right">
            <span className="security-tag">
              <ShieldCheck size={13} /> Encrypted Session
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
