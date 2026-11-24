"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, FileText, LoaderCircle, Trash2 } from "lucide-react";
import { exportPdfPageOrder, loadPdfForWorkspace, type PdfPageSource } from "@/lib/pdf-advanced";

function PageThumbnail({ document, pageNumber, selected, onSelect }: {
  document: PdfPageSource; pageNumber: number; selected: boolean; onSelect: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    async function render() {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 0.22 });
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context || cancelled) return;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: context, viewport, canvas }).promise;
    }
    void render();
    return () => { cancelled = true; };
  }, [document, pageNumber]);
  return <button type="button" onClick={onSelect} className={"pp-page-thumb " + (selected ? "is-selected" : "")}>
    <canvas ref={canvasRef} />
    <span>Page {pageNumber}</span>
  </button>;
}

export default function PdfPageWorkspace({ file, onChange }: { file: File; onChange: (file: File) => void }) {
  const [document, setDocument] = useState<PdfPageSource | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [selected, setSelected] = useState(0);
  const [dragged, setDragged] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mainCanvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let alive = true;
    setDocument(null);
    setError("");
    loadPdfForWorkspace(file).then((loaded) => {
      if (!alive) { void loaded.destroy(); return; }
      setDocument(loaded);
      setOrder(Array.from({ length: loaded.numPages }, (_, index) => index));
      setSelected(0);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load this PDF."));
    return () => { alive = false; };
  }, [file]);

  useEffect(() => {
    let cancelled = false;
    async function renderMain() {
      if (!document || !mainCanvas.current || order.length === 0) return;
      const page = await document.getPage(order[selected] + 1);
      const viewport = page.getViewport({ scale: Math.min(1.35, 850 / page.getViewport({ scale: 1 }).width) });
      const canvas = mainCanvas.current;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      if (!cancelled) await page.render({ canvasContext: context, viewport, canvas }).promise;
    }
    void renderMain();
    return () => { cancelled = true; };
  }, [document, order, selected]);

  async function commit(nextOrder: number[]) {
    if (!nextOrder.length) { setError("A PDF must contain at least one page."); return; }
    setBusy(true);
    setError("");
    try {
      const updated = await exportPdfPageOrder(file, nextOrder);
      setOrder(nextOrder.map((_, index) => index));
      setSelected(Math.min(selected, nextOrder.length - 1));
      onChange(updated);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update the PDF.");
    } finally {
      setBusy(false);
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setSelected(to);
    void commit(next);
  }

  function dropAt(target: number) {
    if (dragged === null || dragged === target) return;
    const next = [...order];
    const [item] = next.splice(dragged, 1);
    next.splice(target, 0, item);
    setDragged(null);
    setSelected(target);
    void commit(next);
  }

  function remove(index: number) {
    const next = order.filter((_, position) => position !== index);
    if (!next.length) { setError("A PDF must contain at least one page."); return; }
    setSelected(Math.min(index, next.length - 1));
    void commit(next);
  }

  if (error && !document) return <div className="pp-pdf-error">{error}</div>;
  if (!document) return <div className="pp-pdf-loading"><LoaderCircle className="spin" size={24} /> Loading PDF pages…</div>;

  return <div className="pp-pdf-workspace">
    <aside className="pp-page-rail">
      <div className="pp-page-rail-title"><FileText size={14} /> PAGES <span>{order.length}</span></div>
      <div className="pp-page-thumbnails">
        {order.map((sourceIndex, index) => <div key={sourceIndex} draggable onDragStart={() => setDragged(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropAt(index)} onDragEnd={() => setDragged(null)} className={dragged === index ? "is-dragging" : ""}>
          <PageThumbnail document={document} pageNumber={sourceIndex + 1} selected={selected === index} onSelect={() => setSelected(index)} />
          <div className="pp-page-controls">
            <button title="Move page up" disabled={index === 0 || busy} onClick={() => move(index, index - 1)}><ArrowUp size={12} /></button>
            <button title="Move page down" disabled={index === order.length - 1 || busy} onClick={() => move(index, index + 1)}><ArrowDown size={12} /></button>
            <button title="Delete page" disabled={order.length === 1 || busy} onClick={() => remove(index)}><Trash2 size={12} /></button>
          </div>
        </div>)}
      </div>
      {error && <p className="pp-page-error">{error}</p>}
    </aside>
    <div className="pp-page-canvas">
      <div className="pp-page-canvas-meta">PAGE {selected + 1} OF {order.length} · DRAG THUMBNAILS TO REORDER</div>
      <div className="pp-page-canvas-scroll"><canvas ref={mainCanvas} /></div>
      {busy && <div className="pp-page-busy"><LoaderCircle className="spin" size={20} /> Saving page changes…</div>}
    </div>
  </div>;
}
