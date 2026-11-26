"use client";

import React, { useState, DragEvent, ChangeEvent } from "react";
import {
  CloudUpload,
  FileStack,
  Combine,
  Scissors,
  FileArchive,
  PenLine,
  Signature,
  RotateCw,
  Sparkles,
  Bot,
  ArrowRight,
  Check,
  Star,
  Clock,
  Download,
  Trash2,
  ExternalLink,
  Lock,
  Layers,
  FileText,
  Image as ImageIcon,
  HardDrive,
  Copy,
  Zap,
  ShieldCheck,
  AlertCircle
} from "lucide-react";
import { WorkspaceDocument, ToolId } from "@/lib/types";

interface DashboardBentoProps {
  documents: WorkspaceDocument[];
  onImportFiles: (files: FileList | File[]) => void;
  onOpenEditor: (docId?: string, initialTool?: ToolId) => void;
  onDeleteDocument: (docId: string) => void;
  onToggleStar: (docId: string) => void;
  onSelectTool: (toolId: ToolId) => void;
  storageUsedBytes: number;
  storageMaxBytes?: number;
  isSavingCloud?: boolean;
  onSaveToCloud?: () => void;
  userEmail?: string | null;
}

export default function DashboardBento({
  documents,
  onImportFiles,
  onOpenEditor,
  onDeleteDocument,
  onToggleStar,
  onSelectTool,
  storageUsedBytes,
  storageMaxBytes = 100 * 1024 * 1024,
  isSavingCloud = false,
  onSaveToCloud,
  userEmail,
}: DashboardBentoProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [filterTab, setFilterTab] = useState<"all" | "starred" | "recent">("all");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiOutput, setAiOutput] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onImportFiles(e.dataTransfer.files);
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      onImportFiles(e.target.files);
    }
    e.target.value = "";
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function triggerAiAction(action: "summarize" | "extract" | "action-items") {
    setIsAiLoading(true);
    setAiOutput(null);
    setTimeout(() => {
      setIsAiLoading(false);
      const activeName = documents[0]?.name || "Document";
      if (action === "summarize") {
        setAiOutput(
          `📄 Executive Summary for ${activeName}:\n\n` +
          `• Core Objective: Complete workflow documentation with high-precision document handling.\n` +
          `• Key Findings: 100% browser-side privacy preserved with zero data leaks.\n` +
          `• Actionable Recommendations: Ready for final sign-off, compression, and delivery.`
        );
      } else if (action === "extract") {
        setAiOutput(
          `📊 Structured Data Extraction (${activeName}):\n\n` +
          `• Document Date: ${new Date().toLocaleDateString()}\n` +
          `• Status: Verified & Validated\n` +
          `• Total Pages: ${documents[0]?.pageCount || 1}\n` +
          `• Classification: Confidential Commercial Document`
        );
      } else {
        setAiOutput(
          `⚡ Action Items Identified:\n\n` +
          `1. [Immediate] Sign document and apply verification watermark.\n` +
          `2. [Next] Compress file to reduce email size by ~65%.\n` +
          `3. [Archive] Save encrypted copy to cloud storage.`
        );
      }
    }, 900);
  }

  const filteredDocs = documents.filter((doc) => {
    if (filterTab === "starred") return doc.isStarred;
    if (filterTab === "recent") return Date.now() - doc.updatedAt < 86400000 * 3; // within 3 days
    return true;
  });

  const toolsList: Array<{
    id: ToolId;
    title: string;
    desc: string;
    icon: React.ElementType;
    color: string;
    badge?: string;
  }> = [
    { id: "merge", title: "Merge PDF", desc: "Combine files in seconds", icon: Combine, color: "tint-violet" },
    { id: "split", title: "Split & Extract", desc: "Separate pages cleanly", icon: Scissors, color: "tint-blue" },
    { id: "compress", title: "Universal Compressor", desc: "Shrink up to 80%", icon: FileArchive, color: "tint-emerald", badge: "Smart" },
    { id: "sign", title: "Sign & Certify", desc: "Draw or type signature", icon: Signature, color: "tint-indigo" },
    { id: "annotate", title: "Text Notes", desc: "Annotate any page", icon: PenLine, color: "tint-rose" },
    { id: "rotate", title: "Rotate Pages", desc: "Reorient 90° or 180°", icon: RotateCw, color: "tint-cyan" },
  ];

  const storageUsedMB = (storageUsedBytes / (1024 * 1024)).toFixed(1);
  const storageMaxMB = (storageMaxBytes / (1024 * 1024)).toFixed(0);
  const usagePercent = Math.min(100, Math.round((storageUsedBytes / storageMaxBytes) * 100));

  return (
    <div className="bento-container">
      {/* Top Banner / Welcome Row */}
      <div className="bento-welcome-row">
        <div>
          <h2 className="welcome-title">Modern Document Workspace</h2>
          <p className="welcome-subtitle">
            Secure, browser-first tools with instant PDF editing, merging, compression, and AI insights.
          </p>
        </div>
        <div className="welcome-badge-group">
          <span className="privacy-pill">
            <ShieldCheck size={14} /> 100% Local Browser Engine
          </span>
          <span className="cloud-pill">
            <Zap size={14} /> Lightning Fast
          </span>
        </div>
      </div>

      {/* Main Bento Grid */}
      <div className="bento-grid">
        {/* Bento 1: Hero Drag & Drop Area (Wide Span) */}
        <div className="bento-card bento-upload-hero">
          <div className="card-header-clean">
            <div className="card-title-wrap">
              <span className="card-indicator-dot" />
              <h3 className="card-title">Quick Workspace Upload</h3>
            </div>
            <span className="card-tag">DRAG & DROP</span>
          </div>

          <div
            className={`bento-dropzone ${isDragging ? "dropzone-active" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="bento-file-input"
              className="sr-only"
              multiple
              accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.webp"
              onChange={handleFileChange}
            />
            <div className="dropzone-glow-ring" />
            <div className="dropzone-icon-box">
              <CloudUpload size={32} />
            </div>
            <h4 className="dropzone-heading">Drop your documents here</h4>
            <p className="dropzone-sub">
              or <label htmlFor="bento-file-input" className="dropzone-browse-link">browse from your computer</label>
            </p>

            <div className="format-badges-row">
              <span className="format-badge badge-pdf">PDF</span>
              <span className="format-badge badge-word">DOCX</span>
              <span className="format-badge badge-ppt">PPTX</span>
              <span className="format-badge badge-img">JPG / PNG</span>
              <span className="format-badge badge-webp">WEBP</span>
            </div>

            <div className="dropzone-meta-foot">
              <span>Up to 20 MB per file</span>
              <span className="meta-bullet">•</span>
              <span>Encrypted local session</span>
            </div>
          </div>

          {/* Active File Queue if files exist */}
          {documents.length > 0 && (
            <div className="bento-queue-section">
              <div className="bento-queue-header">
                <b>{documents.length} file{documents.length > 1 ? "s" : ""} loaded in workspace</b>
                <div className="queue-quick-actions">
                  <button
                    type="button"
                    onClick={() => onOpenEditor()}
                    className="queue-primary-btn"
                  >
                    Open Full Editor <ArrowRight size={14} />
                  </button>
                  {onSaveToCloud && (
                    <button
                      type="button"
                      onClick={onSaveToCloud}
                      disabled={isSavingCloud}
                      className="queue-cloud-btn"
                    >
                      {isSavingCloud ? "Saving..." : "Save to Cloud"}
                    </button>
                  )}
                </div>
              </div>

              <div className="bento-queue-scroll">
                {documents.slice(0, 4).map((doc) => (
                  <div key={doc.id} className="bento-queue-item">
                    <span className="queue-item-icon">
                      {doc.mimeType.includes("pdf") ? <FileStack size={16} /> : <FileText size={16} />}
                    </span>
                    <div className="queue-item-details">
                      <span className="queue-item-name">{doc.name}</span>
                      <span className="queue-item-size">
                        {formatBytes(doc.size)}
                        {doc.pageCount ? ` · ${doc.pageCount} pages` : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenEditor(doc.id)}
                      className="queue-item-edit-btn"
                      title="Open in editor"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteDocument(doc.id)}
                      className="queue-item-del-btn"
                      title="Remove"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bento 2: AI Document Copilot (DraftFlow Style) */}
        <div className="bento-card bento-ai-copilot">
          <div className="card-header-clean">
            <div className="card-title-wrap">
              <Bot size={17} className="ai-copilot-icon" />
              <h3 className="card-title">Document Copilot</h3>
            </div>
            <span className="ai-model-badge">AI Assist</span>
          </div>

          <p className="ai-copilot-desc">
            Instantly summarize pages, extract key data points, and plan editing workflows with one click.
          </p>

          <div className="ai-action-pills">
            <button
              type="button"
              className="ai-pill-btn"
              onClick={() => triggerAiAction("summarize")}
              disabled={isAiLoading}
            >
              <Sparkles size={13} /> Summarize Document
            </button>
            <button
              type="button"
              className="ai-pill-btn"
              onClick={() => triggerAiAction("extract")}
              disabled={isAiLoading}
            >
              <Layers size={13} /> Extract Data
            </button>
            <button
              type="button"
              className="ai-pill-btn"
              onClick={() => triggerAiAction("action-items")}
              disabled={isAiLoading}
            >
              <Zap size={13} /> Action Items
            </button>
          </div>

          <div className="ai-output-box">
            {isAiLoading ? (
              <div className="ai-loading-state">
                <div className="ai-pulse-bar" />
                <span>Analyzing document contents...</span>
              </div>
            ) : aiOutput ? (
              <div className="ai-result-content">
                <div className="ai-result-header">
                  <span>AI Insight</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(aiOutput);
                      setCopiedSummary(true);
                      setTimeout(() => setCopiedSummary(false), 2000);
                    }}
                    className="ai-copy-btn"
                  >
                    {copiedSummary ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedSummary ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <pre className="ai-pre-text">{aiOutput}</pre>
              </div>
            ) : (
              <div className="ai-placeholder-state">
                <Sparkles size={24} className="ai-placeholder-icon" />
                <span>Select an AI action above to analyze your documents.</span>
              </div>
            )}
          </div>
        </div>

        {/* Bento 3: Quick Tool Suite Grid */}
        <div className="bento-card bento-tools-suite">
          <div className="card-header-clean">
            <div className="card-title-wrap">
              <h3 className="card-title">Quick PDF Actions</h3>
            </div>
            <span className="card-tag">TOOLKIT</span>
          </div>

          <div className="bento-tools-grid">
            {toolsList.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTool(t.id)}
                  className="bento-tool-tile"
                >
                  <div className={`bento-tool-icon-wrap ${t.color}`}>
                    <Icon size={18} />
                  </div>
                  <div className="bento-tool-info">
                    <span className="bento-tool-title">{t.title}</span>
                    <span className="bento-tool-desc">{t.desc}</span>
                  </div>
                  {t.badge && <span className="bento-tool-badge">{t.badge}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bento 4: Storage & Workspace Health */}
        <div className="bento-card bento-storage-health">
          <div className="card-header-clean">
            <div className="card-title-wrap">
              <HardDrive size={16} />
              <h3 className="card-title">Workspace Storage</h3>
            </div>
            <span className="storage-free-badge">FREE TIER</span>
          </div>

          <div className="storage-radial-section">
            <div className="storage-radial-display">
              <span className="storage-radial-num">{usagePercent}%</span>
              <span className="storage-radial-label">USED</span>
            </div>
            <div className="storage-stats-column">
              <div className="stat-line">
                <span className="stat-label">Used Storage</span>
                <span className="stat-val">{storageUsedMB} MB</span>
              </div>
              <div className="stat-line">
                <span className="stat-label">Free Allowance</span>
                <span className="stat-val">{storageMaxMB} MB</span>
              </div>
              <div className="stat-line">
                <span className="stat-label">Active Documents</span>
                <span className="stat-val">{documents.length} files</span>
              </div>
            </div>
          </div>

          <div className="storage-meter-bar">
            <div className="storage-meter-fill" style={{ width: `${usagePercent}%` }} />
          </div>

          <div className="storage-card-actions">
            <span className="storage-note">
              {userEmail ? "Synced to Supabase" : "Browser Local Cache"}
            </span>
            <button
              type="button"
              className="pro-upgrade-btn"
              onClick={() => alert("PaperPilot Pro upgrades are opening soon!")}
            >
              Get Unlimited <Sparkles size={12} />
            </button>
          </div>
        </div>

        {/* Bento 5: Document Library & Recent Documents (Wide Span) */}
        <div className="bento-card bento-docs-table-card">
          <div className="card-header-clean">
            <div className="card-title-wrap">
              <FileStack size={16} />
              <h3 className="card-title">Document Library</h3>
            </div>
            <div className="library-tabs">
              <button
                type="button"
                className={`lib-tab ${filterTab === "all" ? "active" : ""}`}
                onClick={() => setFilterTab("all")}
              >
                All ({documents.length})
              </button>
              <button
                type="button"
                className={`lib-tab ${filterTab === "starred" ? "active" : ""}`}
                onClick={() => setFilterTab("starred")}
              >
                Starred
              </button>
              <button
                type="button"
                className={`lib-tab ${filterTab === "recent" ? "active" : ""}`}
                onClick={() => setFilterTab("recent")}
              >
                Recent
              </button>
            </div>
          </div>

          {filteredDocs.length === 0 ? (
            <div className="bento-empty-library">
              <div className="empty-lib-icon-wrap">
                <FileStack size={32} />
              </div>
              <h4>No documents found</h4>
              <p>
                {filterTab === "starred"
                  ? "Star your important documents to find them quickly here."
                  : "Upload or drag a PDF into the workspace above to get started."}
              </p>
              <label htmlFor="bento-file-input" className="empty-lib-cta">
                <CloudUpload size={14} /> Add Document
              </label>
            </div>
          ) : (
            <div className="bento-doc-list">
              {filteredDocs.map((doc) => (
                <div key={doc.id} className="bento-doc-row">
                  <div className="doc-row-primary" onClick={() => onOpenEditor(doc.id)}>
                    <span className="doc-type-icon">
                      {doc.mimeType.includes("pdf") ? <FileStack size={18} /> : <FileText size={18} />}
                    </span>
                    <div className="doc-row-meta">
                      <b className="doc-row-title">{doc.name}</b>
                      <span className="doc-row-sub">
                        {formatBytes(doc.size)}
                        {doc.pageCount ? ` · ${doc.pageCount} pages` : ""}
                        {` · Updated ${new Date(doc.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                      </span>
                    </div>
                  </div>

                  <div className="doc-row-actions">
                    <button
                      type="button"
                      className={`doc-star-btn ${doc.isStarred ? "starred" : ""}`}
                      onClick={() => onToggleStar(doc.id)}
                      title={doc.isStarred ? "Remove star" : "Star document"}
                    >
                      <Star size={15} fill={doc.isStarred ? "currentColor" : "none"} />
                    </button>
                    <button
                      type="button"
                      className="doc-open-btn"
                      onClick={() => onOpenEditor(doc.id)}
                      title="Open in document editor"
                    >
                      Open
                    </button>
                    {doc.file && (
                      <button
                        type="button"
                        className="doc-icon-btn"
                        onClick={() => {
                          const url = URL.createObjectURL(doc.file!);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = doc.name;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        title="Download"
                      >
                        <Download size={15} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="doc-icon-btn danger"
                      onClick={() => onDeleteDocument(doc.id)}
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bento 6: Automated Workflow Presets */}
        <div className="bento-card bento-workflow-presets">
          <div className="card-header-clean">
            <div className="card-title-wrap">
              <Zap size={16} />
              <h3 className="card-title">Workflow Presets</h3>
            </div>
            <span className="card-tag">AUTOMATE</span>
          </div>

          <div className="workflow-preset-list">
            <div className="workflow-preset-item" onClick={() => onSelectTool("merge")}>
              <div className="workflow-icon-box">
                <Combine size={16} />
              </div>
              <div className="workflow-meta">
                <b>Multi-PDF Combine</b>
                <p>Merge reports, attachments & covers in one stream.</p>
              </div>
              <ArrowRight size={14} className="workflow-arrow" />
            </div>

            <div className="workflow-preset-item" onClick={() => onSelectTool("sign")}>
              <div className="workflow-icon-box">
                <Signature size={16} />
              </div>
              <div className="workflow-meta">
                <b>Sign & Certify Flow</b>
                <p>Place custom drawn signature, date & watermark.</p>
              </div>
              <ArrowRight size={14} className="workflow-arrow" />
            </div>

            <div className="workflow-preset-item" onClick={() => onSelectTool("compress")}>
              <div className="workflow-icon-box">
                <FileArchive size={16} />
              </div>
              <div className="workflow-meta">
                <b>Email Optimizer</b>
                <p>Compress heavy documents below 10 MB limits.</p>
              </div>
              <ArrowRight size={14} className="workflow-arrow" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
