import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  addPageNumbers,
  addTextToPdf,
  addWatermarkToPdf,
  deletePages,
  extractPages,
  imageToPdf,
  mergePdfs,
  optimizePdf,
  parsePageRange,
  reorderPages,
  rotatePages,
  splitPdf,
} from "../lib/pdf-tools.ts";

async function createPdfFile(name, pageSizes) {
  const document = await PDFDocument.create();
  for (const [width, height] of pageSizes) {
    document.addPage([width, height]);
  }
  return new File([await document.save()], name, { type: "application/pdf" });
}

async function loadResult(bytes) {
  return PDFDocument.load(bytes);
}

function pageSizes(document) {
  return document.getPages().map((page) => page.getSize());
}

test("parsePageRange expands ranges, removes duplicates, and returns zero-based indexes", () => {
  assert.deepEqual(parsePageRange("1, 3-4, 3", 5), [0, 2, 3]);
  assert.deepEqual(parsePageRange("all", 3), [0, 1, 2]);
});

test("parsePageRange rejects malformed and out-of-bounds input", () => {
  for (const value of ["0", "4", "2-1", "1, nope"]) {
    assert.throws(() => parsePageRange(value, 3), undefined, value);
  }
});

test("mergePdfs preserves requested page selection and input order", async () => {
  const first = await createPdfFile("first.pdf", [[100, 200], [110, 210]]);
  const second = await createPdfFile("second.pdf", [[300, 400]]);
  const result = await mergePdfs([
    { file: first, pageRange: "2" },
    { file: second },
  ]);
  const merged = await loadResult(result.bytes);

  assert.equal(result.pageCount, 2);
  assert.equal(merged.getPageCount(), 2);
  assert.deepEqual(pageSizes(merged), [
    { width: 110, height: 210 },
    { width: 300, height: 400 },
  ]);
});

test("splitPdf creates one readable single-page PDF per source page", async () => {
  const source = await createPdfFile("source.pdf", [[100, 200], [110, 210], [120, 220]]);
  const results = await splitPdf(source);

  assert.equal(results.length, 3);
  for (const result of results) {
    const document = await loadResult(result.bytes);
    assert.equal(document.getPageCount(), 1);
    assert.equal(result.pageCount, 1);
  }
});

test("extractPages exports only the requested page range", async () => {
  const source = await createPdfFile("source.pdf", [[100, 200], [110, 210], [120, 220]]);
  const result = await extractPages(source, "2-3");
  const extracted = await loadResult(result.bytes);

  assert.equal(extracted.getPageCount(), 2);
  assert.deepEqual(pageSizes(extracted), [
    { width: 110, height: 210 },
    { width: 120, height: 220 },
  ]);
});

test("rotatePages applies rotation only to selected pages", async () => {
  const source = await createPdfFile("source.pdf", [[100, 200], [110, 210]]);
  const result = await rotatePages(source, [1], 90);
  const rotated = await loadResult(result.bytes);

  assert.deepEqual(rotated.getPages().map((page) => page.getRotation().angle), [0, 90]);
});

test("reorderPages follows the requested page order", async () => {
  const source = await createPdfFile("source.pdf", [[100, 200], [110, 210], [120, 220]]);
  const result = await reorderPages(source, [2, 0, 1]);
  const reordered = await loadResult(result.bytes);

  assert.deepEqual(pageSizes(reordered), [
    { width: 120, height: 220 },
    { width: 100, height: 200 },
    { width: 110, height: 210 },
  ]);
});

test("deletePages preserves remaining pages and refuses to delete the whole document", async () => {
  const source = await createPdfFile("source.pdf", [[100, 200], [110, 210], [120, 220]]);
  const result = await deletePages(source, [1]);
  const reduced = await loadResult(result.bytes);

  assert.deepEqual(pageSizes(reduced), [
    { width: 100, height: 200 },
    { width: 120, height: 220 },
  ]);
  await assert.rejects(deletePages(source, [0, 1, 2]), /Cannot delete all pages/);
});

test("optimizePdf produces a readable copy without assuming it must be smaller", async () => {
  const source = await createPdfFile("source.pdf", [[100, 200], [110, 210]]);
  const result = await optimizePdf(source, "recommended");
  const optimized = await loadResult(result.bytes);

  assert.equal(optimized.getPageCount(), 2);
  assert.equal(result.pageCount, 2);
  assert.equal(result.filename, "source-compressed.pdf");
});

test("text annotations, watermarks, and page numbers preserve document structure", async () => {
  const source = await createPdfFile("source.pdf", [[612, 792], [612, 792]]);
  const annotated = await addTextToPdf(source, "Review note");
  const watermarked = await addWatermarkToPdf(
    new File([annotated.bytes], "annotated.pdf", { type: "application/pdf" }),
    "DRAFT"
  );
  const numbered = await addPageNumbers(
    new File([watermarked.bytes], "watermarked.pdf", { type: "application/pdf" })
  );
  const finalDocument = await loadResult(numbered.bytes);

  assert.equal(finalDocument.getPageCount(), 2);
});

test("imageToPdf rejects empty input and unsupported image formats", async () => {
  await assert.rejects(imageToPdf([]), /Choose at least one JPG or PNG image/);
  const gif = new File(["not-an-image"], "sample.gif", { type: "image/gif" });
  await assert.rejects(imageToPdf([gif]), /not directly supported/);
});

test("the current workspace keeps its editor and document studios wired", async () => {
  const dashboard = await readFile(new URL("../components/dashboard.tsx", import.meta.url), "utf8");
  for (const component of ["DashboardBento", "DocumentEditor", "MergeStudio", "CompressorStudio", "OfficeStudios"]) {
    assert.ok(dashboard.includes(component), component + " must remain wired into the workspace");
  }
  assert.ok(dashboard.includes("saveAutosaveSession"));
  assert.ok(dashboard.includes("loadAutosaveSession"));
});
