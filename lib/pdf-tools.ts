import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

export type PdfResult = { bytes: Uint8Array; filename: string };

function outputName(source: string, suffix: string) {
  const stem = source.replace(/\.pdf$/i, "").replace(/[^a-z0-9-_]/gi, "-") || "document";
  return stem + "-" + suffix + ".pdf";
}

export async function mergePdfs(files: File[]): Promise<PdfResult> {
  const pdfFiles = files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
  if (pdfFiles.length < 2) throw new Error("Import at least two PDF files to merge.");
  const merged = await PDFDocument.create();
  for (const file of pdfFiles) {
    const source = await PDFDocument.load(await file.arrayBuffer());
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  return { bytes: await merged.save({ useObjectStreams: true }), filename: "paperpilot-merged.pdf" };
}

function parsePageRange(range: string, total: number): number[] {
  const pages = new Set<number>();
  for (const part of range.split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error("Use page numbers like 1, 3-5, 8.");
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end > total) throw new Error("Page range must be between 1 and " + total + ".");
    for (let page = start; page <= end; page += 1) pages.add(page - 1);
  }
  const result = Array.from(pages).sort((a, b) => a - b);
  if (!result.length) throw new Error("Enter at least one page.");
  return result;
}

export async function extractPages(file: File, range: string): Promise<PdfResult> {
  const source = await PDFDocument.load(await file.arrayBuffer());
  const selected = parsePageRange(range, source.getPageCount());
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, selected);
  pages.forEach((page) => output.addPage(page));
  return { bytes: await output.save({ useObjectStreams: true }), filename: outputName(file.name, "pages") };
}

export async function rotatePages(file: File): Promise<PdfResult> {
  const document = await PDFDocument.load(await file.arrayBuffer());
  document.getPages().forEach((page) => page.setRotation(degrees((page.getRotation().angle + 90) % 360)));
  return { bytes: await document.save({ useObjectStreams: true }), filename: outputName(file.name, "rotated") };
}

export async function addTextToPdf(file: File, text: string, signature = false): Promise<PdfResult> {
  const value = text.trim();
  if (!value) throw new Error(signature ? "Enter the name to sign with." : "Enter annotation text.");
  const document = await PDFDocument.load(await file.arrayBuffer());
  const page = document.getPages()[0];
  if (!page) throw new Error("This PDF has no pages.");
  const font = await document.embedFont(StandardFonts.Helvetica);
  const size = signature ? 23 : 14;
  const pageSize = page.getSize();
  page.drawText(value.slice(0, 180), {
    x: signature ? 48 : 42,
    y: signature ? 42 : Math.max(54, pageSize.height - 72),
    size,
    font,
    color: signature ? rgb(0.16, 0.28, 0.72) : rgb(0.12, 0.2, 0.36),
    maxWidth: Math.max(120, pageSize.width - 90),
    lineHeight: size * 1.3
  });
  return { bytes: await document.save({ useObjectStreams: true }), filename: outputName(file.name, signature ? "signed" : "annotated") };
}


export async function splitPdf(file: File): Promise<PdfResult[]> {
  const source = await PDFDocument.load(await file.arrayBuffer());
  const count = source.getPageCount();
  if (count < 2) throw new Error("This PDF has only one page, so it cannot be split into multiple files.");
  const results: PdfResult[] = [];
  for (let index = 0; index < count; index += 1) {
    const output = await PDFDocument.create();
    const [page] = await output.copyPages(source, [index]);
    output.addPage(page);
    results.push({ bytes: await output.save({ useObjectStreams: true }), filename: outputName(file.name, "page-" + (index + 1)) });
  }
  return results;
}

export async function optimizePdf(file: File): Promise<PdfResult> {
  const source = await PDFDocument.load(await file.arrayBuffer());
  return { bytes: await source.save({ useObjectStreams: true, addDefaultPage: false }), filename: outputName(file.name, "optimized") };
}

export async function imageToPdf(files: File[]): Promise<PdfResult> {
  if (!files.length) throw new Error("Choose at least one JPG or PNG image.");
  const output = await PDFDocument.create();
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const lower = file.name.toLowerCase();
    let image;
    if (file.type === "image/png" || lower.endsWith(".png")) image = await output.embedPng(bytes);
    else if (file.type === "image/jpeg" || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) image = await output.embedJpg(bytes);
    else throw new Error("Only JPG and PNG images can be converted in this tool.");
    const page = output.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
  return { bytes: await output.save({ useObjectStreams: true }), filename: "paperpilot-images.pdf" };
}
