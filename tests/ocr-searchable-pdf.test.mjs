import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { addInvisibleOcrTextLayer } from "../lib/ocr-text-layer.mjs";

test("invisible OCR text remains extractable from the generated PDF", async () => {
  const output = await PDFDocument.create();
  const page = output.addPage([612, 792]);
  const font = await output.embedFont(StandardFonts.Helvetica);
  const inserted = addInvisibleOcrTextLayer(page, font, [
    { text: "PaperPilot", x: 54, y: 700, width: 72, height: 12 },
    { text: "searchable OCR", x: 130, y: 700, width: 90, height: 12 }
  ]);
  assert.equal(inserted, 2);

  const bytes = await output.save({ useObjectStreams: true });
  const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  const parsed = await loading.promise;
  try {
    assert.equal(parsed.numPages, 1);
    const parsedPage = await parsed.getPage(1);
    const content = await parsedPage.getTextContent();
    const text = content.items.map((item) => "str" in item ? item.str : "").join(" ");
    assert.match(text, /PaperPilot/);
    assert.match(text, /searchable OCR/);
  } finally {
    await parsed.destroy();
  }
});

test("unsupported Devanagari glyphs are skipped without losing the transcript path", async () => {
  const output = await PDFDocument.create();
  const page = output.addPage([300, 300]);
  const font = await output.embedFont(StandardFonts.Helvetica);
  const inserted = addInvisibleOcrTextLayer(page, font, [
    { text: "नमस्ते", x: 30, y: 200, width: 60, height: 12 }
  ]);
  assert.equal(inserted, 0);
});
