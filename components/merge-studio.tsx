"use client";

import React, { useState, DragEvent } from "react";
import {
  Combine,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  FileStack,
  Download,
  CloudUpload,
  Check,
  RotateCw,
  LoaderCircle,
  FileText,
  Layers,
  Sparkles
} from "lucide-react";
import { MergeFileItem } from "@/lib/types";
import { mergePdfs, getPdfInfo } from "@/lib/pdf-tools";

interface MergeStudioProps {
  onMergeComplete: (mergedFile: File) => void;
  onSaveToCloud?: (file: File) => Promise<void>;
}

export default function MergeStudio({ onMergeComplete, onSaveToCloud }: MergeStudioProps) {
  const [items, setItems] = useState<MergeFileItem[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [mergedResult, setMergedResult] = useState<File | null>(null);
  const [mergedBlobUrl, setMergedBlobUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  async function addFiles(files: FileList | File[]) {
    const newItems: MergeFileItem[] = [];
    for (const file of Array.from(files)) {
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        let pageCount = 1;
        try {
          const info = await getPdfInfo(file);
          pageCount = info.pageCount;
        } catch {}
        newItems.push({
          id: crypto.randomUUID(),
          file,
          name: file.name,
          size: file.size,
          pageCount,
          pageRange: "all",
          rotation: 0,
        });
      }
    }
    setItems((prev) => [...prev, ...newItems]);
    setMergedResult(null);
    setMergedBlobUrl(null);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  }

  function moveItem(index: number, direction: "up" | "down") {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= items.length) return;
    const updated = [...items];
    const temp = updated[index];
    updated[index] = updated[target];
    updated[target] = temp;
    setItems(updated);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function updatePageRange(id: string, range: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, pageRange: range } : item))
    );
  }

  function rotateItem(id: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, rotation: (item.rotation + 90) % 360 } : item
      )
    );
  }

  async function executeMerge() {
    if (items.length < 2 || isMerging) return;
    setIsMerging(true);
    try {
      const payload = items.map((it) => ({
        file: it.file,
        pageRange: it.pageRange,
        rotation: it.rotation,
      }));
      const result = await mergePdfs(payload);
      const buffer = new ArrayBuffer(result.bytes.byteLength);
      new Uint8Array(buffer).set(result.bytes);
      const mergedFile = new File([buffer], result.filename, { type: "application/pdf" });
      const url = URL.createObjectURL(mergedFile);

      setMergedResult(mergedFile);
      setMergedBlobUrl(url);
      onMergeComplete(mergedFile);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setIsMerging(false);
    }
  }

  const totalPages = items.reduce((sum, it) => sum + it.pageCount, 0);
  const totalBytes = items.reduce((sum, it) => sum + it.size, 0);
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);

  return (
    <div className="studio-container">
      <div className="studio-header-row">
        <div>
          <h2 className="studio-title">Multi-Document Merge Workflow</h2>
          <p className="studio-sub">
            Reorder files, select custom page ranges, and merge multiple PDFs into one unified document.
          </p>
        </div>
        <div className="studio-stats-badge">
          <span>{items.length} Files</span>
          <span>•</span>
          <span>{totalPages} Pages</span>
          <span>•</span>
          <span>{totalMB} MB Total</span>
        </div>
      </div>

      <div className="merge-studio-layout">
        {/* Left Column: Drag & Drop + File Order List */}
        <div className="merge-list-column">
          <div
            className={`merge-drop-zone ${isDragging ? "drop-active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="merge-file-input"
              className="sr-only"
              multiple
              accept=".pdf"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
            <Combine size={24} className="merge-drop-icon" />
            <b>Drop PDF files to merge</b>
            <p>
              or <label htmlFor="merge-file-input" className="link-text">choose files</label> from device
            </p>
          </div>

          <div className="merge-items-wrapper">
            {items.length === 0 ? (
              <div className="merge-empty-state">
                <FileStack size={32} />
                <p>Add 2 or more PDF documents to configure the merge order.</p>
              </div>
            ) : (
              items.map((item, index) => (
                <div key={item.id} className="merge-item-card">
                  <div className="merge-order-badge">{index + 1}</div>
                  <div className="merge-item-info">
                    <b className="merge-item-name">{item.name}</b>
                    <span className="merge-item-sub">
                      {item.pageCount} pages · {(item.size / 1024).toFixed(0)} KB
                      {item.rotation > 0 ? ` · Rotated ${item.rotation}°` : ""}
                    </span>
                  </div>

                  <div className="merge-page-range-box">
                    <span>Pages:</span>
                    <input
                      type="text"
                      className="range-input"
                      placeholder="all or 1-3, 5"
                      value={item.pageRange}
                      onChange={(e) => updatePageRange(item.id, e.target.value)}
                    />
                  </div>

                  <div className="merge-item-actions">
                    <button
                      type="button"
                      className="merge-action-btn"
                      onClick={() => rotateItem(item.id)}
                      title="Rotate 90°"
                    >
                      <RotateCw size={14} />
                    </button>
                    <button
                      type="button"
                      className="merge-action-btn"
                      disabled={index === 0}
                      onClick={() => moveItem(index, "up")}
                      title="Move Up"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="merge-action-btn"
                      disabled={index === items.length - 1}
                      onClick={() => moveItem(index, "down")}
                      title="Move Down"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      className="merge-action-btn danger"
                      onClick={() => removeItem(item.id)}
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {items.length >= 2 && (
            <button
              type="button"
              className="merge-execute-btn"
              onClick={executeMerge}
              disabled={isMerging}
            >
              {isMerging ? (
                <>
                  <LoaderCircle size={16} className="spin-fast" /> Merging {items.length} Files...
                </>
              ) : (
                <>
                  <Combine size={16} /> Merge {items.length} Documents Now
                </>
              )}
            </button>
          )}
        </div>

        {/* Right Column: Live Merge Result & Preview */}
        <div className="merge-preview-column">
          {mergedResult && mergedBlobUrl ? (
            <div className="merge-result-box">
              <div className="merge-result-header">
                <div>
                  <span className="success-tag">
                    <Check size={13} /> Merge Complete
                  </span>
                  <h3>{mergedResult.name}</h3>
                  <small>
                    {(mergedResult.size / (1024 * 1024)).toFixed(2)} MB · Ready for download
                  </small>
                </div>
                <div className="merge-result-actions">
                  <a
                    href={mergedBlobUrl}
                    download={mergedResult.name}
                    className="merge-download-btn"
                  >
                    <Download size={14} /> Download PDF
                  </a>
                  {onSaveToCloud && (
                    <button
                      type="button"
                      className="merge-cloud-btn"
                      onClick={() => onSaveToCloud(mergedResult)}
                    >
                      <CloudUpload size={14} /> Save to Cloud
                    </button>
                  )}
                </div>
              </div>

              <div className="merge-preview-frame-wrap">
                <iframe
                  src={`${mergedBlobUrl}#toolbar=1`}
                  className="merge-pdf-frame"
                  title="Merged PDF Preview"
                />
              </div>
            </div>
          ) : (
            <div className="merge-preview-placeholder">
              <Layers size={48} className="placeholder-icon" />
              <h3>Merged Document Preview</h3>
              <p>Add at least 2 PDF files on the left and click Merge to generate a live preview.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
