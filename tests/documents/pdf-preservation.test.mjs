import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { addTextToPdf, extractPages, mergePdfs, rotatePages, splitPdf } from "../../lib/pdf-tools.ts";

async function makePdf(name, count) {
  const document = await PDFDocument.create();
  for (let index = 0; index < count; index += 1) document.addPage([300 + index, 400 + index]);
  const bytes = await document.save();
  return new File([bytes], name, { type: "application/pdf" });
}
async function pageCount(bytes) {
  return (await PDFDocument.load(bytes)).getPageCount();
}

test("existing PDF merge still combines every source page", async () => {
  const first = await makePdf("first.pdf", 2);
  const second = await makePdf("second.pdf", 3);
  const result = await mergePdfs([first, second]);
  assert.equal(await pageCount(result.bytes), 5);
  assert.equal(result.filename, "paperpilot-merged.pdf");
});
test("existing PDF split still creates one output per page", async () => {
  const source = await makePdf("source.pdf", 3);
  const outputs = await splitPdf(source);
  assert.equal(outputs.length, 3);
  for (const output of outputs) assert.equal(await pageCount(output.bytes), 1);
});
test("existing PDF extract and rotate operations remain intact", async () => {
  const source = await makePdf("source.pdf", 3);
  const extracted = await extractPages(source, "1, 3");
  assert.equal(await pageCount(extracted.bytes), 2);
  const rotated = await rotatePages(source);
  const document = await PDFDocument.load(rotated.bytes);
  assert.equal(document.getPageCount(), 3);
  assert.equal(document.getPage(0).getRotation().angle, 90);
});
test("existing PDF annotation and typed signature operations remain intact", async () => {
  const source = await makePdf("source.pdf", 1);
  const annotated = await addTextToPdf(source, "Preservation test note", false);
  const signed = await addTextToPdf(source, "PaperPilot Test", true);
  assert.equal(await pageCount(annotated.bytes), 1);
  assert.equal(await pageCount(signed.bytes), 1);
  await assert.rejects(() => addTextToPdf(source, "  ", false), /Enter annotation text/);
});
