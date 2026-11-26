"use client";

import React, { useState, DragEvent } from "react";
import {
  FileArchive,
  Download,
  CloudUpload,
  Check,
  Zap,
  ShieldCheck,
  Sparkles,
  LoaderCircle,
  FileText
} from "lucide-react";
import { optimizePdf } from "@/lib/pdf-tools";

interface CompressorStudioProps {
  onOptimized: (file: File) => void;
  onSaveToCloud?: (file: File) => Promise<void>;
}

export default function CompressorStudio({ onOptimized, onSaveToCloud }: CompressorStudioProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [level, setLevel] = useState<"extreme" | "recommended" | "low">("recommended");
  const [isCompressing, setIsCompressing] = useState(false);
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        setSelectedFile(file);
        setResultFile(null);
        setResultUrl(null);
      }
    }
  }

  async function executeCompress() {
    if (!selectedFile || isCompressing) return;
    setIsCompressing(true);
    try {
      const res = await optimizePdf(selectedFile, level);
      const buffer = new ArrayBuffer(res.bytes.byteLength);
      new Uint8Array(buffer).set(res.bytes);
      const file = new File([buffer], res.filename, { type: "application/pdf" });
      const url = URL.createObjectURL(file);
      setResultFile(file);
      setResultUrl(url);
      onOptimized(file);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Compression failed");
    } finally {
      setIsCompressing(false);
    }
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  const reductionRatio = selectedFile && resultFile
    ? Math.max(0, Math.round(((selectedFile.size - resultFile.size) / selectedFile.size) * 100))
    : 0;

  return (
    <div className="studio-container">
      <div className="studio-header-row">
        <div>
          <h2 className="studio-title">Universal PDF Compressor</h2>
          <p className="studio-sub">
            Shrink document file sizes for easy email sharing and faster web viewing while retaining visual clarity.
          </p>
        </div>
        <span className="privacy-pill">
          <ShieldCheck size={14} /> 100% Client-Side Engine
        </span>
      </div>

      <div className="compressor-card">
        {/* Drop zone or active file card */}
        {!selectedFile ? (
          <div
            className={`compress-dropzone ${isDragging ? "dropzone-active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="compress-file-picker"
              className="sr-only"
              accept=".pdf"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setSelectedFile(e.target.files[0]);
                  setResultFile(null);
                }
              }}
            />
            <FileArchive size={36} className="compress-icon" />
            <h3>Drop a PDF to compress</h3>
            <p>
              or <label htmlFor="compress-file-picker" className="link-text">choose a file</label> from your device
            </p>
          </div>
        ) : (
          <div className="compress-file-selected-box">
            <div className="file-meta-row">
              <span className="file-badge-icon">
                <FileText size={20} />
              </span>
              <div>
                <b>{selectedFile.name}</b>
                <span className="file-size-tag">Original: {formatBytes(selectedFile.size)}</span>
              </div>
              <button
                type="button"
                className="change-file-btn"
                onClick={() => {
                  setSelectedFile(null);
                  setResultFile(null);
                }}
              >
                Change File
              </button>
            </div>

            {/* Presets Grid */}
            <div className="presets-title">Choose Compression Intensity</div>
            <div className="presets-grid">
              <div
                className={`preset-card ${level === "extreme" ? "active" : ""}`}
                onClick={() => setLevel("extreme")}
              >
                <div className="preset-head">
                  <b>Extreme</b>
                  <span className="preset-ratio">Up to -75%</span>
                </div>
                <p>Maximum compression. Ideal for quick email attachments and mobile viewing.</p>
              </div>

              <div
                className={`preset-card ${level === "recommended" ? "active" : ""}`}
                onClick={() => setLevel("recommended")}
              >
                <div className="preset-head">
                  <b>Recommended</b>
                  <span className="preset-ratio-recommended">Up to -50%</span>
                </div>
                <p>Balanced quality and file size. Good for general office and legal documents.</p>
              </div>

              <div
                className={`preset-card ${level === "low" ? "active" : ""}`}
                onClick={() => setLevel("low")}
              >
                <div className="preset-head">
                  <b>Low</b>
                  <span className="preset-ratio">Up to -25%</span>
                </div>
                <p>Lossless stream cleanup and object optimization. Preserves maximum resolution.</p>
              </div>
            </div>

            <button
              type="button"
              className="compress-action-btn"
              onClick={executeCompress}
              disabled={isCompressing}
            >
              {isCompressing ? (
                <>
                  <LoaderCircle size={16} className="spin-fast" /> Optimizing Document...
                </>
              ) : (
                <>
                  <Zap size={16} /> Compress Document Now
                </>
              )}
            </button>
          </div>
        )}

        {/* Compression Result Banner */}
        {resultFile && resultUrl && (
          <div className="compression-result-card">
            <div className="result-stats-group">
              <div className="result-metric">
                <span className="metric-label">Original Size</span>
                <span className="metric-value">{formatBytes(selectedFile!.size)}</span>
              </div>
              <div className="result-arrow-divider">→</div>
              <div className="result-metric">
                <span className="metric-label">Optimized Size</span>
                <span className="metric-value-green">{formatBytes(resultFile.size)}</span>
              </div>
              <div className="result-badge-pill">
                <Check size={14} /> Saved {reductionRatio}%
              </div>
            </div>

            <div className="result-actions-row">
              <a
                href={resultUrl}
                download={resultFile.name}
                className="result-download-btn"
              >
                <Download size={14} /> Download Compressed PDF
              </a>
              {onSaveToCloud && (
                <button
                  type="button"
                  className="result-cloud-btn"
                  onClick={() => onSaveToCloud(resultFile)}
                >
                  <CloudUpload size={14} /> Save to Cloud
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
