import { PDFDocument, StandardFonts } from "pdf-lib";
import { addInvisibleOcrTextLayer } from "./ocr-text-layer.mjs";
import { createWorker } from "tesseract.js";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export type PdfPageSource = PDFDocumentProxy;

export async function loadPdfForWorkspace(file: File): Promise<PDFDocumentProxy> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const task = getDocument({ data: bytes });
  const document = await task.promise;
  if (document.numPages > 150) {
    await task.destroy();
    throw new Error("This workspace supports up to 150 pages per PDF to protect browser memory.");
  }
  return document;
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
    const baseViewport = page.getViewport({ scale: 1 });
    const safeScale = Math.min(scale, Math.sqrt(16_000_000 / Math.max(1, baseViewport.width * baseViewport.height)));
    const viewport = page.getViewport({ scale: safeScale });
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

export type OcrResult = {
  transcript: File;
  searchablePdf: File | null;
  pages: number;
  wordsRecognized: number;
};

const searchableTextLanguages = new Set(["eng", "deu", "fra", "spa"]);

export async function ocrPdf(
  file: File,
  language: string,
  onProgress?: (completed: number, total: number) => void
): Promise<OcrResult> {
  const source = await loadPdfForWorkspace(file);
  if (source.numPages > 100) {
    await source.cleanup();
    throw new Error("OCR is limited to 100 pages per file in the browser.");
  }

  const canEmbedSearchableText = searchableTextLanguages.has(language);
  const searchableDocument = canEmbedSearchableText
    ? await PDFDocument.load(await file.arrayBuffer())
    : null;
  const font = searchableDocument
    ? await searchableDocument.embedFont(StandardFonts.Helvetica)
    : null;
  const transcriptPages: string[] = [];
  let wordsRecognized = 0;
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;

  try {
    worker = await createWorker(language);
    for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
      const page = await source.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1.7, Math.sqrt(16_000_000 / Math.max(1, baseViewport.width * baseViewport.height)));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not create an OCR canvas.");

      try {
        await page.render({ canvasContext: context, viewport, canvas }).promise;
        const result = await worker.recognize(canvas);
        transcriptPages.push("===== Page " + pageNumber + " =====\n" + result.data.text.trim());

        if (searchableDocument && font) {
          const recognizedWords = (result.data.blocks ?? []).flatMap((block) =>
            block.paragraphs.flatMap((paragraph) =>
              paragraph.lines.flatMap((line) => line.words)
            )
          );
          const positionedWords = recognizedWords
            .filter((word) => word.confidence >= 20 && word.text.trim())
            .map((word) => {
              const [left, bottom] = viewport.convertToPdfPoint(word.bbox.x0, word.bbox.y1);
              const [right, top] = viewport.convertToPdfPoint(word.bbox.x1, word.bbox.y0);
              return {
                text: word.text,
                x: Math.min(left, right),
                y: Math.min(bottom, top),
                width: Math.abs(right - left),
                height: Math.abs(top - bottom)
              };
            });
          wordsRecognized += addInvisibleOcrTextLayer(
            searchableDocument.getPage(pageNumber - 1),
            font,
            positionedWords
          );
        }
      } finally {
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }

      onProgress?.(pageNumber, source.numPages);
    }
  } finally {
    if (worker) await worker.terminate();
    await source.cleanup();
  }

  const transcriptText = transcriptPages.join("\n\n").trim();
  if (!transcriptText) throw new Error("OCR did not recognize any text in this PDF.");
  const stem = file.name.replace(/\.pdf$/i, "") || "document";
  const transcript = new File([transcriptText], stem + "-ocr.txt", {
    type: "text/plain;charset=utf-8"
  });

  let searchablePdf: File | null = null;
  if (searchableDocument && wordsRecognized > 0) {
    const bytes = await searchableDocument.save({ useObjectStreams: true });
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    searchablePdf = new File([buffer], stem + "-searchable.pdf", { type: "application/pdf" });
  }

  return { transcript, searchablePdf, pages: source.numPages, wordsRecognized };
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
  if (source.numPages > 100) throw new Error("Image export is limited to 100 pages per file in the browser.");
  const output: File[] = [];
  for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
    const page = await source.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1.5, Math.sqrt(16_000_000 / Math.max(1, baseViewport.width * baseViewport.height)));
    const viewport = page.getViewport({ scale });
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
