"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FlipHorizontal, RotateCw, RotateCcw, RefreshCw, Image as ImageIcon } from "lucide-react";

type OutputFormat = "image/png" | "image/jpeg" | "image/webp";

export default function ImageStudio({ file, onResult }: { file: File; onResult: (file: File) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [rotation, setRotation] = useState(0);
  const [flip, setFlip] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [maxWidth, setMaxWidth] = useState(0);
  const [format, setFormat] = useState<OutputFormat>("image/png");
  const [quality, setQuality] = useState(0.88);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    let active = true;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      imageRef.current = image;
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      setMaxWidth(image.naturalWidth);
      setError("");
    };
    image.onerror = () => active && setError("This image could not be decoded by your browser.");
    image.src = url;
    return () => { active = false; URL.revokeObjectURL(url); imageRef.current = null; };
  }, [file]);

  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;
    const scale = maxWidth > 0 && maxWidth < image.naturalWidth ? maxWidth / image.naturalWidth : 1;
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const quarterTurn = Math.abs(rotation % 180) === 90;
    canvas.width = quarterTurn ? height : width;
    canvas.height = quarterTurn ? width : height;
    const context = canvas.getContext("2d");
    if (!context) { setError("Canvas rendering is unavailable in this browser."); return; }
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(rotation * Math.PI / 180);
    context.scale(flip ? -1 : 1, 1);
    context.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    context.drawImage(image, -width / 2, -height / 2, width, height);
    context.restore();
    setError("");
  }, [file, rotation, flip, brightness, contrast, saturation, maxWidth]);

  function reset() {
    setRotation(0); setFlip(false); setBrightness(100); setContrast(100); setSaturation(100);
    if (imageRef.current) setMaxWidth(imageRef.current.naturalWidth);
    setFormat("image/png"); setQuality(0.88);
  }

  async function exportImage() {
    const canvas = canvasRef.current;
    if (!canvas || busy) return;
    setBusy(true); setError("");
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("The browser could not encode this image.")),
        format, format === "image/png" ? undefined : quality
      ));
      const extension = format === "image/jpeg" ? "jpg" : format === "image/webp" ? "webp" : "png";
      const base = file.name.replace(/\.[^.]+$/, "") || "image";
      onResult(new File([blob], base + "-edited." + extension, { type: format, lastModified: Date.now() }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Image export failed.");
    } finally { setBusy(false); }
  }

  return <div style={{ width: "100%", height: "100%", minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0,1fr) 250px", background: "#e9eeeb", borderRadius: 7, overflow: "hidden" }}>
    <div style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 14px", background: "white", borderBottom: "1px solid #e3eae4", display: "flex", justifyContent: "space-between", color: "#718078", fontSize: 10 }}>
        <span><ImageIcon size={13} style={{ verticalAlign: "middle", marginRight: 6 }} />Image preview · original stays unchanged</span>
        <span>{dimensions.width} × {dimensions.height}px</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "grid", placeItems: "center", padding: 20 }}>
        {error && !imageRef.current ? <p style={{ color: "#b65e55", fontSize: 11 }}>{error}</p> : <canvas ref={canvasRef} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", background: "white", boxShadow: "0 5px 22px rgba(30,49,36,.14)" }} />}
      </div>
    </div>
    <aside style={{ background: "#fff", borderLeft: "1px solid #e3eae4", padding: 14, overflow: "auto", display: "flex", flexDirection: "column", gap: 13 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b style={{ fontSize: 11 }}>Image Studio</b><button onClick={reset} title="Reset edits" style={iconButton}><RefreshCw size={14} /></button></div>
      <div style={controlGroup}><label style={labelStyle}>Transform</label><div style={{ display: "flex", gap: 6 }}><button style={smallButton} onClick={() => setRotation((v) => (v - 90 + 360) % 360)}><RotateCcw size={13} /> Left</button><button style={smallButton} onClick={() => setRotation((v) => (v + 90) % 360)}><RotateCw size={13} /> Right</button><button style={smallButton} onClick={() => setFlip((v) => !v)}><FlipHorizontal size={13} /> Flip</button></div></div>
      <Slider label="Brightness" value={brightness} min={0} max={200} onChange={setBrightness} />
      <Slider label="Contrast" value={contrast} min={0} max={200} onChange={setContrast} />
      <Slider label="Saturation" value={saturation} min={0} max={200} onChange={setSaturation} />
      <div style={controlGroup}><label style={labelStyle}>Resize width</label><input type="number" min={1} max={dimensions.width || 1} value={maxWidth || ""} onChange={(e) => setMaxWidth(Math.min(dimensions.width || 1, Math.max(1, Number(e.target.value) || 1)))} style={fieldStyle} /><small style={hintStyle}>Height scales proportionally. Original dimensions: {dimensions.width} × {dimensions.height}px.</small></div>
      <div style={controlGroup}><label style={labelStyle}>Export format</label><select value={format} onChange={(e) => setFormat(e.target.value as OutputFormat)} style={fieldStyle}><option value="image/png">PNG · lossless</option><option value="image/jpeg">JPEG · lossy</option><option value="image/webp">WebP · compact</option></select></div>
      {format !== "image/png" && <div style={controlGroup}><label style={labelStyle}>Quality · {Math.round(quality * 100)}%</label><input type="range" min="0.4" max="1" step="0.01" value={quality} onChange={(e) => setQuality(Number(e.target.value))} style={{ width: "100%" }} /></div>}
      {error && <p role="alert" style={{ color: "#b65e55", fontSize: 9, margin: 0 }}>{error}</p>}
      <button disabled={busy || !dimensions.width} onClick={exportImage} style={exportButton}><Download size={14} />{busy ? "Exporting…" : "Save as new revision"}</button>
      <small style={hintStyle}>Export creates a new file tab. Your uploaded original is never overwritten. Edits are local to this browser session until you save a revision to your account.</small>
    </aside>
  </div>;
}

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <div style={controlGroup}><label style={labelStyle}>{label} · {value}%</label><input aria-label={label} type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: "100%" }} /></div>;
}
const controlGroup = { display: "flex", flexDirection: "column" as const, gap: 6 };
const labelStyle = { fontSize: 9, fontWeight: 800, color: "#607067" };
const hintStyle = { fontSize: 8, color: "#929e95", lineHeight: 1.5 };
const fieldStyle = { width: "100%", border: "1px solid #e2eae3", borderRadius: 6, padding: "8px 9px", background: "#fff", color: "#4c5d51", fontSize: 9 };
const smallButton = { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, border: "1px solid #e2eae3", borderRadius: 6, padding: "7px 3px", background: "#fbfdfb", color: "#557060", fontSize: 8 };
const iconButton = { border: "1px solid #e2eae3", borderRadius: 6, padding: 6, background: "#fff", color: "#557060" };
const exportButton = { marginTop: "auto", border: 0, borderRadius: 7, padding: 10, background: "#1d7658", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 9, fontWeight: 800 };
