import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const dashboardUrl = new URL("../../components/dashboard.tsx", import.meta.url);
const source = await readFile(dashboardUrl, "utf8");
const start = source.indexOf("async function runPdfAction(");
const end = source.indexOf("\n  function closeEditor()", start);

assert.notEqual(start, -1, "runPdfAction must exist");
assert.notEqual(end, -1, "runPdfAction must end before closeEditor");

const actionSource = source.slice(start, end);
const count = (needle) => actionSource.split(needle).length - 1;

test("image-to-PDF dispatch uses valid MIME and extension patterns", () => {
  assert.ok(actionSource.includes('/^image\\/(jpeg|png)$/i'));
  assert.ok(actionSource.includes('/\\.(jpe?g|png)$/i'));
  assert.ok(actionSource.includes('if (action === "convert")'));
  assert.ok(actionSource.includes("imageToPdf(images)"));
});

test("the image-to-PDF toolbar guard uses the same valid patterns", () => {
  const convertButtonLine = source.split("\n").find((line) => line.includes('runPdfAction("convert")'));
  assert.ok(convertButtonLine, "Images to PDF action button must exist");
  assert.ok(convertButtonLine.includes('/^image\\/(jpeg|png)$/i'));
  assert.ok(convertButtonLine.includes('/\\.(jpe?g|png)$/i'));
});

test("split and compression dispatch each have exactly one branch", () => {
  assert.equal(count('action === "split"'), 1);
  assert.equal(count('action === "compress"'), 1);
  assert.equal(count("splitPdf(activeFile)"), 1);
  assert.equal(count("optimizePdf(activeFile)"), 1);
});

test("existing PDF operations remain wired", () => {
  for (const operation of [
    "imageToPdf(images)",
    "mergePdfs(files)",
    "rotatePages(activeFile)",
    "extractPages(activeFile, pageRange)",
    "addTextToPdf(activeFile, annotation, false)",
    "addTextToPdf(activeFile, signature, true)"
  ]) {
    assert.ok(actionSource.includes(operation), operation + " must remain available");
  }
});

test("the action function contains real line breaks, not escaped newline tokens", () => {
  assert.equal(actionSource.includes("\\n"), false);
});

const pdfToolsUrl = new URL("../../lib/pdf-tools.ts", import.meta.url);
const pdfToolsSource = await readFile(pdfToolsUrl, "utf8");

test("PDF utility exports are defined exactly once", () => {
  for (const exportName of ["splitPdf", "optimizePdf", "imageToPdf"]) {
    const needle = "export async function " + exportName;
    assert.equal(pdfToolsSource.split(needle).length - 1, 1, exportName + " must have one implementation");
  }
});
