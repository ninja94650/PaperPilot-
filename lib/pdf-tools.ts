import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

export type PdfResult = { bytes: Uint8Array; filename: string; pageCount?: number };

function outputName(source: string, suffix: string) {
  const stem = source.replace(/\.pdf$/i, "").replace(/[^a-z0-9-_]/gi, "-") || "document";
  return stem + "-" + suffix + ".pdf";
}

export function parsePageRange(range: string, total: number): number[] {
  if (!range || range.trim().toLowerCase() === "all") {
    return Array.from({ length: total }, (_, i) => i);
  }
  const pages = new Set<number>();
  for (const part of range.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error("Invalid page range: '" + trimmed + "'. Use format: 1, 3-5, 8");
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end > total) {
      throw new Error("Page range must be between 1 and " + total + ".");
    }
    for (let page = start; page <= end; page += 1) pages.add(page - 1);
  }
  const result = Array.from(pages).sort((a, b) => a - b);
  if (!result.length) throw new Error("Enter at least one valid page number.");
  return result;
}

export async function getPdfInfo(file: File): Promise<{
  pageCount: number;
  pages: { width: number; height: number; rotation: number }[];
}> {
  const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const count = source.getPageCount();
  const pages = source.getPages().map((p) => {
    const size = p.getSize();
    return {
      width: Math.round(size.width),
      height: Math.round(size.height),
      rotation: p.getRotation().angle,
    };
  });
  return { pageCount: count, pages };
}

export async function mergePdfs(
  files: { file: File; pageRange?: string; rotation?: number }[] | File[]
): Promise<PdfResult> {
  const normalized: { file: File; pageRange?: string; rotation?: number }[] = files.map((item) =>
    item instanceof File ? { file: item } : item
  );

  const pdfItems = normalized.filter(
    (item) => item.file.type === "application/pdf" || item.file.name.toLowerCase().endsWith(".pdf")
  );

  if (pdfItems.length < 2) throw new Error("Select at least two PDF files to merge.");
  const merged = await PDFDocument.create();

  for (const item of pdfItems) {
    const source = await PDFDocument.load(await item.file.arrayBuffer());
    const totalPages = source.getPageCount();
    const indices = item.pageRange
      ? parsePageRange(item.pageRange, totalPages)
      : source.getPageIndices();

    const pages = await merged.copyPages(source, indices);
    pages.forEach((page) => {
      if (item.rotation) {
        page.setRotation(degrees((page.getRotation().angle + item.rotation) % 360));
      }
      merged.addPage(page);
    });
  }

  const bytes = await merged.save({ useObjectStreams: true });
  return {
    bytes,
    filename: "paperpilot-merged.pdf",
    pageCount: merged.getPageCount(),
  };
}

export async function extractPages(file: File, range: string): Promise<PdfResult> {
  const source = await PDFDocument.load(await file.arrayBuffer());
  const selected = parsePageRange(range, source.getPageCount());
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, selected);
  pages.forEach((page) => output.addPage(page));
  return {
    bytes: await output.save({ useObjectStreams: true }),
    filename: outputName(file.name, "pages"),
    pageCount: output.getPageCount(),
  };
}

export async function rotatePages(
  file: File,
  pageIndices?: number[],
  angleDegrees: number = 90
): Promise<PdfResult> {
  const document = await PDFDocument.load(await file.arrayBuffer());
  const pages = document.getPages();
  const targets = pageIndices && pageIndices.length > 0 ? pageIndices : pages.map((_, i) => i);

  targets.forEach((idx) => {
    if (pages[idx]) {
      pages[idx].setRotation(degrees((pages[idx].getRotation().angle + angleDegrees) % 360));
    }
  });

  return {
    bytes: await document.save({ useObjectStreams: true }),
    filename: outputName(file.name, "rotated"),
    pageCount: document.getPageCount(),
  };
}

export async function deletePages(file: File, pageIndicesToDelete: number[]): Promise<PdfResult> {
  const source = await PDFDocument.load(await file.arrayBuffer());
  const total = source.getPageCount();
  const toDelete = new Set(pageIndicesToDelete);

  if (toDelete.size >= total) {
    throw new Error("Cannot delete all pages. The document must have at least one page.");
  }

  const toKeep: number[] = [];
  for (let i = 0; i < total; i++) {
    if (!toDelete.has(i)) toKeep.push(i);
  }

  const output = await PDFDocument.create();
  const copied = await output.copyPages(source, toKeep);
  copied.forEach((p) => output.addPage(p));

  return {
    bytes: await output.save({ useObjectStreams: true }),
    filename: outputName(file.name, "modified"),
    pageCount: output.getPageCount(),
  };
}

export async function reorderPages(file: File, newPageOrder: number[]): Promise<PdfResult> {
  const source = await PDFDocument.load(await file.arrayBuffer());
  const total = source.getPageCount();

  if (newPageOrder.length !== total) {
    throw new Error("New page order length must match total pages.");
  }

  const output = await PDFDocument.create();
  const copied = await output.copyPages(source, newPageOrder);
  copied.forEach((p) => output.addPage(p));

  return {
    bytes: await output.save({ useObjectStreams: true }),
    filename: outputName(file.name, "reordered"),
    pageCount: output.getPageCount(),
  };
}

export async function duplicatePage(file: File, pageIndex: number): Promise<PdfResult> {
  const source = await PDFDocument.load(await file.arrayBuffer());
  const total = source.getPageCount();
  if (pageIndex < 0 || pageIndex >= total) throw new Error("Invalid page index");

  const order: number[] = [];
  for (let i = 0; i < total; i++) {
    order.push(i);
    if (i === pageIndex) order.push(i);
  }

  const output = await PDFDocument.create();
  const copied = await output.copyPages(source, order);
  copied.forEach((p) => output.addPage(p));

  return {
    bytes: await output.save({ useObjectStreams: true }),
    filename: outputName(file.name, "page-duplicated"),
    pageCount: output.getPageCount(),
  };
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
    results.push({
      bytes: await output.save({ useObjectStreams: true }),
      filename: outputName(file.name, "page-" + (index + 1)),
      pageCount: 1,
    });
  }
  return results;
}

export async function addTextToPdf(
  file: File,
  text: string,
  signature = false,
  options?: {
    pageIndex?: number;
    fontSize?: number;
    color?: { r: number; g: number; b: number };
    x?: number;
    y?: number;
  }
): Promise<PdfResult> {
  const value = text.trim();
  if (!value) throw new Error(signature ? "Enter the signature name." : "Enter note text.");
  const document = await PDFDocument.load(await file.arrayBuffer());
  const targetIndex = options?.pageIndex ?? 0;
  const page = document.getPages()[targetIndex];
  if (!page) throw new Error("Selected page does not exist.");

  const font = await document.embedFont(
    signature ? StandardFonts.TimesRomanItalic : StandardFonts.Helvetica
  );
  const size = options?.fontSize ?? (signature ? 24 : 14);
  const pageSize = page.getSize();

  const textColor = options?.color
    ? rgb(options.color.r, options.color.g, options.color.b)
    : signature
    ? rgb(0.18, 0.28, 0.76)
    : rgb(0.1, 0.15, 0.28);

  const posX = options?.x ?? (signature ? 48 : 42);
  const posY = options?.y ?? (signature ? 48 : Math.max(54, pageSize.height - 72));

  page.drawText(value.slice(0, 300), {
    x: posX,
    y: posY,
    size,
    font,
    color: textColor,
    maxWidth: Math.max(120, pageSize.width - 90),
    lineHeight: size * 1.3,
  });

  return {
    bytes: await document.save({ useObjectStreams: true }),
    filename: outputName(file.name, signature ? "signed" : "annotated"),
    pageCount: document.getPageCount(),
  };
}

export async function embedSignatureImage(
  file: File,
  signaturePngBase64: string,
  options?: {
    pageIndex?: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }
): Promise<PdfResult> {
  const document = await PDFDocument.load(await file.arrayBuffer());
  const targetIndex = options?.pageIndex ?? 0;
  const page = document.getPages()[targetIndex];
  if (!page) throw new Error("Selected page does not exist.");

  // Convert base64 data URL to bytes
  const base64Data = signaturePngBase64.replace(/^data:image\/png;base64,/, "");
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const pngImage = await document.embedPng(bytes);
  const width = options?.width ?? 180;
  const height = options?.height ?? (width / pngImage.width) * pngImage.height;
  const x = options?.x ?? 48;
  const y = options?.y ?? 48;

  page.drawImage(pngImage, {
    x,
    y,
    width,
    height,
  });

  return {
    bytes: await document.save({ useObjectStreams: true }),
    filename: outputName(file.name, "signed"),
    pageCount: document.getPageCount(),
  };
}

export async function addWatermarkToPdf(
  file: File,
  text: string,
  options?: {
    opacity?: number;
    size?: number;
    angle?: number;
    color?: { r: number; g: number; b: number };
  }
): Promise<PdfResult> {
  const watermarkText = text.trim();
  if (!watermarkText) throw new Error("Enter watermark text.");
  const document = await PDFDocument.load(await file.arrayBuffer());
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  const pages = document.getPages();

  const opacity = options?.opacity ?? 0.18;
  const size = options?.size ?? 48;
  const angle = options?.angle ?? 45;
  const color = options?.color ? rgb(options.color.r, options.color.g, options.color.b) : rgb(0.5, 0.5, 0.5);

  pages.forEach((page) => {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(watermarkText, size);
    page.drawText(watermarkText, {
      x: width / 2 - textWidth / 2,
      y: height / 2,
      size,
      font,
      color,
      opacity,
      rotate: degrees(angle),
    });
  });

  return {
    bytes: await document.save({ useObjectStreams: true }),
    filename: outputName(file.name, "watermarked"),
    pageCount: pages.length,
  };
}

export async function addPageNumbers(
  file: File,
  position: "bottom-center" | "bottom-right" | "top-right" = "bottom-center"
): Promise<PdfResult> {
  const document = await PDFDocument.load(await file.arrayBuffer());
  const font = await document.embedFont(StandardFonts.Helvetica);
  const pages = document.getPages();
  const total = pages.length;

  pages.forEach((page, i) => {
    const { width, height } = page.getSize();
    const text = `Page ${i + 1} of ${total}`;
    const textWidth = font.widthOfTextAtSize(text, 10);

    let x = width / 2 - textWidth / 2;
    let y = 24;

    if (position === "bottom-right") {
      x = width - textWidth - 36;
      y = 24;
    } else if (position === "top-right") {
      x = width - textWidth - 36;
      y = height - 30;
    }

    page.drawText(text, {
      x,
      y,
      size: 10,
      font,
      color: rgb(0.4, 0.45, 0.5),
    });
  });

  return {
    bytes: await document.save({ useObjectStreams: true }),
    filename: outputName(file.name, "numbered"),
    pageCount: total,
  };
}

export async function optimizePdf(
  file: File,
  level: "extreme" | "recommended" | "low" = "recommended"
): Promise<PdfResult> {
  const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  // PDF-lib optimize repack with object stream compression
  const bytes = await source.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: level === "low",
  });
  return {
    bytes,
    filename: outputName(file.name, "compressed"),
    pageCount: source.getPageCount(),
  };
}

export async function imageToPdf(files: File[]): Promise<PdfResult> {
  if (!files.length) throw new Error("Choose at least one JPG or PNG image.");
  const output = await PDFDocument.create();

  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const lower = file.name.toLowerCase();
    let image;
    if (file.type === "image/png" || lower.endsWith(".png")) {
      image = await output.embedPng(bytes);
    } else if (
      file.type === "image/jpeg" ||
      file.type === "image/jpg" ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg")
    ) {
      image = await output.embedJpg(bytes);
    } else {
      // For webp or other formats, we can draw to an offscreen canvas and convert to PNG
      throw new Error(`Format of ${file.name} is not directly supported. Use JPG or PNG.`);
    }

    // Standard page layout: letter or scaled fit
    const page = output.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }

  const bytes = await output.save({ useObjectStreams: true });
  return {
    bytes,
    filename: "paperpilot-images.pdf",
    pageCount: output.getPageCount(),
  };
}
