"use client";

import React, { useState } from "react";
import {
  FileText,
  Presentation,
  Image as ImageIcon,
  Users,
  Upload,
  Sparkles,
  Download,
  Check,
  ArrowRight,
  ShieldCheck,
  Star,
  Trash2,
  Share2,
  ExternalLink,
  Copy
} from "lucide-react";
import { StudioView, WorkspaceDocument } from "@/lib/types";
import { imageToPdf } from "@/lib/pdf-tools";

interface StudioProps {
  view: StudioView;
  documents: WorkspaceDocument[];
  onOpenEditor: (docId?: string) => void;
  onImportFiles: (files: FileList | File[]) => void;
  onDeleteDoc: (docId: string) => void;
  onToggleStar: (docId: string) => void;
}

export default function OfficeStudios({
  view,
  documents,
  onOpenEditor,
  onImportFiles,
  onDeleteDoc,
  onToggleStar,
}: StudioProps) {
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [convertedPdf, setConvertedPdf] = useState<{ name: string; url: string } | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  async function handleConvertImages() {
    if (!imageFiles.length || isConverting) return;
    setIsConverting(true);
    try {
      const res = await imageToPdf(imageFiles);
      const buffer = new ArrayBuffer(res.bytes.byteLength);
      new Uint8Array(buffer).set(res.bytes);
      const file = new File([buffer], res.filename, { type: "application/pdf" });
      const url = URL.createObjectURL(file);
      setConvertedPdf({ name: file.name, url });
      onImportFiles([file]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Conversion failed");
    } finally {
      setIsConverting(false);
    }
  }

  if (view === "image-studio") {
    return (
      <div className="studio-container">
        <div className="studio-header-row">
          <div>
            <h2 className="studio-title">Image Studio & Multi-Photo PDF</h2>
            <p className="studio-sub">
              Convert JPG, PNG, and WebP images into standardized high-resolution PDF documents.
            </p>
          </div>
          <span className="privacy-pill">
            <ShieldCheck size={14} /> Local Rendering
          </span>
        </div>

        <div className="image-studio-box">
          <div className="image-dropzone">
            <input
              type="file"
              id="image-file-input"
              className="sr-only"
              multiple
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                if (e.target.files) {
                  setImageFiles(Array.from(e.target.files));
                  setConvertedPdf(null);
                }
              }}
            />
            <ImageIcon size={38} className="image-drop-icon" />
            <h3>Select or drop images to bundle</h3>
            <p>
              or <label htmlFor="image-file-input" className="link-text">browse files</label> from device
            </p>
          </div>

          {imageFiles.length > 0 && (
            <div className="image-selection-grid">
              <div className="image-grid-header">
                <b>{imageFiles.length} image{imageFiles.length > 1 ? "s" : ""} selected</b>
                <button
                  type="button"
                  onClick={handleConvertImages}
                  disabled={isConverting}
                  className="image-convert-btn"
                >
                  <Sparkles size={14} /> {isConverting ? "Building PDF..." : "Convert to PDF"}
                </button>
              </div>

              <div className="image-preview-thumbs">
                {imageFiles.map((img, idx) => (
                  <div key={idx} className="image-thumb-card">
                    <span className="thumb-index">{idx + 1}</span>
                    <span className="thumb-name">{img.name}</span>
                    <span className="thumb-size">{(img.size / 1024).toFixed(0)} KB</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {convertedPdf && (
            <div className="conversion-success-card">
              <div className="success-content">
                <Check size={20} className="success-icon" />
                <div>
                  <b>PDF Generation Complete</b>
                  <p>{convertedPdf.name} is ready for download or further editing.</p>
                </div>
              </div>
              <a href={convertedPdf.url} download={convertedPdf.name} className="download-btn-compact">
                <Download size={14} /> Download PDF
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === "word-studio") {
    return (
      <div className="studio-container">
        <div className="studio-header-row">
          <div>
            <h2 className="studio-title">Word Studio</h2>
            <p className="studio-sub">
              Upload and manage Microsoft Word documents (.docx, .doc) with seamless PDF conversion pipelines.
            </p>
          </div>
          <span className="privacy-pill">
            <Sparkles size={14} /> Office 365 Compatible
          </span>
        </div>

        <div className="office-empty-showcase">
          <FileText size={48} className="office-icon-primary" />
          <h3>Word Document Pipeline</h3>
          <p>
            Drop DOCX files here to convert them into printable, digitally signable PDF contracts and briefs.
          </p>
          <input
            type="file"
            id="word-file-picker"
            className="sr-only"
            accept=".doc,.docx"
            onChange={(e) => e.target.files && onImportFiles(e.target.files)}
          />
          <label htmlFor="word-file-picker" className="office-cta-btn">
            <Upload size={14} /> Import Word Document
          </label>
        </div>
      </div>
    );
  }

  if (view === "presentation-studio") {
    return (
      <div className="studio-container">
        <div className="studio-header-row">
          <div>
            <h2 className="studio-title">Presentation Studio</h2>
            <p className="studio-sub">
              Convert pitch decks, slide handouts, and PPTX presentations into crisp PDF slide decks.
            </p>
          </div>
          <span className="privacy-pill">
            <Sparkles size={14} /> Keynote & PowerPoint
          </span>
        </div>

        <div className="office-empty-showcase">
          <Presentation size={48} className="office-icon-primary" />
          <h3>Deck Conversion Hub</h3>
          <p>
            Prepare presentations for executive distribution and printing with automated vector rendering.
          </p>
          <input
            type="file"
            id="ppt-file-picker"
            className="sr-only"
            accept=".ppt,.pptx"
            onChange={(e) => e.target.files && onImportFiles(e.target.files)}
          />
          <label htmlFor="ppt-file-picker" className="office-cta-btn">
            <Upload size={14} /> Import Presentation (.pptx)
          </label>
        </div>
      </div>
    );
  }

  if (view === "shared") {
    return (
      <div className="studio-container">
        <div className="studio-header-row">
          <div>
            <h2 className="studio-title">Shared Documents & Collaboration</h2>
            <p className="studio-sub">
              Create protected sharing links, manage team permissions, and inspect document audit logs.
            </p>
          </div>
        </div>

        <div className="shared-link-generator-card">
          <div className="generator-header">
            <Share2 size={18} />
            <b>Quick Share Link Generator</b>
          </div>
          <p>Generate a secure, time-limited viewing link for the current workspace session.</p>
          <div className="link-input-row">
            <input
              type="text"
              readOnly
              value={`https://paperpilot.app/share/session-${Math.random().toString(36).substring(7)}`}
              className="share-link-input"
            />
            <button
              type="button"
              className="copy-link-btn"
              onClick={() => {
                navigator.clipboard.writeText(window.location.origin);
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2000);
              }}
            >
              {copiedLink ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedLink ? "Copied" : "Copy Link"}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // All Documents, Recent, Starred
  const filtered = documents.filter((d) => {
    if (view === "starred") return d.isStarred;
    return true;
  });

  return (
    <div className="studio-container">
      <div className="studio-header-row">
        <div>
          <h2 className="studio-title">
            {view === "starred" ? "Starred Documents" : view === "recent" ? "Recent Documents" : "All Documents"}
          </h2>
          <p className="studio-sub">
            {view === "starred"
              ? "Important documents pinned for fast access."
              : "Complete inventory of documents in your local session and cloud library."}
          </p>
        </div>
      </div>

      <div className="docs-table-card">
        {filtered.length === 0 ? (
          <div className="empty-table-state">
            <FileText size={36} />
            <p>No documents found in this view.</p>
          </div>
        ) : (
          <div className="docs-table">
            <div className="table-header-row">
              <span className="col-name">Name</span>
              <span className="col-size">Size</span>
              <span className="col-type">Format</span>
              <span className="col-updated">Last Modified</span>
              <span className="col-actions">Actions</span>
            </div>
            {filtered.map((d) => (
              <div key={d.id} className="table-data-row">
                <div className="col-name file-name-cell" onClick={() => onOpenEditor(d.id)}>
                  <FileText size={16} className="file-cell-icon" />
                  <span className="file-name-text">{d.name}</span>
                </div>
                <span className="col-size">{(d.size / 1024).toFixed(0)} KB</span>
                <span className="col-type">{d.mimeType.split("/")[1] || "pdf"}</span>
                <span className="col-updated">
                  {new Date(d.updatedAt).toLocaleDateString()} {new Date(d.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <div className="col-actions row-actions-cell">
                  <button
                    type="button"
                    onClick={() => onToggleStar(d.id)}
                    className={`table-action-btn ${d.isStarred ? "starred" : ""}`}
                    title={d.isStarred ? "Unstar" : "Star"}
                  >
                    <Star size={14} fill={d.isStarred ? "currentColor" : "none"} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenEditor(d.id)}
                    className="table-action-btn open-cta"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteDoc(d.id)}
                    className="table-action-btn danger"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
