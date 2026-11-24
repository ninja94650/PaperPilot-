import { PDFDocument } from "pdf-lib";
import { createWorker } from "tesseract.js";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export type PdfPageSource = PDFDocumentProxy;

export async function loadPdfForWorkspace(file: File): Promise<PDFDocumentProxy> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return getDocument({ data: bytes }).promise;
}

export async function exportPdfPageOrder(file: File, pageOrder: number[]): Promise<File> {
  if (!pageOrder.length) throw new Error("A PDF must contain at least one page.");
  const source = await PDFDocument.load(await file.arrayBuffer());
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, pageOrder);
  pages.forEach((page) => output.addPage(page));
  const bytes = await output.save({ useObjectStreams: true });
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const stem = file.name.replace(/\.pdf$/i, "");
  return new File([buffer], stem + "-organized.pdf", { type: "application/pdf" });
}

export async function compressPdfRasterized(
  file: File,
  quality: number,
  onProgress?: (completed: number, total: number) => void
): Promise<File> {
  const source = await loadPdfForWorkspace(file);
  const output = await PDFDocument.create();
  const total = source.numPages;
  const scale = quality >= 0.82 ? 1.5 : quality >= 0.62 ? 1.15 : 0.9;

  for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
    const page = await source.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not create a PDF rendering canvas.");
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not encode a compressed page.")), "image/jpeg", quality);
    });
    const jpg = new Uint8Array(await blob.arrayBuffer());
    const image = await output.embedJpg(jpg);
    const outputPage = output.addPage([page.view[2] - page.view[0], page.view[3] - page.view[1]]);
    outputPage.drawImage(image, { x: 0, y: 0, width: outputPage.getWidth(), height: outputPage.getHeight() });
    canvas.width = 0;
    canvas.height = 0;
    onProgress?.(pageNumber, total);
  }

  const bytes = await output.save({ useObjectStreams: true });
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new File([buffer], file.name.replace(/\.pdf$/i, "") + "-compressed.pdf", { type: "application/pdf" });
}

export async function ocrPdf(file: File, language: string, onProgress?: (completed: number, total: number) => void): Promise<string> {
  const source = await loadPdfForWorkspace(file);
  const worker = await createWorker(language);
  const output: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
      const page = await source.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.7 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not create an OCR canvas.");
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      const result = await worker.recognize(canvas);
      output.push("===== Page " + pageNumber + " =====\n" + result.data.text.trim());
      canvas.width = 0;
      canvas.height = 0;
      onProgress?.(pageNumber, source.numPages);
    }
  } finally {
    await worker.terminate();
  }
  return output.join("\n\n");
}

export async function imageFilesToPdf(files: File[]): Promise<File> {
  const images = files.filter((file) => file.type.startsWith("image/"));
  if (!images.length) throw new Error("Choose one or more JPG, PNG or WebP images.");
  const output = await PDFDocument.create();
  for (const file of images) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not process an image.");
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Image encoding failed.")), "image/jpeg", 0.94));
    const jpg = new Uint8Array(await blob.arrayBuffer());
    const embedded = await output.embedJpg(jpg);
    const page = output.addPage([embedded.width, embedded.height]);
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
  const bytes = await output.save({ useObjectStreams: true });
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new File([buffer], "paperpilot-images.pdf", { type: "application/pdf" });
}

export async function pdfToPngs(file: File): Promise<File[]> {
  const source = await loadPdfForWorkspace(file);
  const output: File[] = [];
  for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
    const page = await source.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not render this PDF page.");
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG export failed.")), "image/png"));
    output.push(new File([blob], file.name.replace(/\.pdf$/i, "") + "-page-" + pageNumber + ".png", { type: "image/png" }));
    canvas.width = 0;
    canvas.height = 0;
  }
  return output;
}
