import test from "node:test";
import assert from "node:assert/strict";
import { validateFile } from "./server.mjs";

const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
const oleHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const asFile = (originalname, buffer) => ({ originalname, buffer });

test("accepts modern DOCX and PPTX files with ZIP signatures", () => {
  assert.equal(validateFile(asFile("report.docx", zipHeader)), ".docx");
  assert.equal(validateFile(asFile("slides.PPTX", zipHeader)), ".pptx");
});

test("accepts legacy DOC and PPT files with OLE signatures", () => {
  assert.equal(validateFile(asFile("report.doc", oleHeader)), ".doc");
  assert.equal(validateFile(asFile("slides.PPT", oleHeader)), ".ppt");
});

test("rejects a signature that does not match the Office extension", () => {
  assert.throws(() => validateFile(asFile("report.docx", oleHeader)), /signature/i);
  assert.throws(() => validateFile(asFile("report.doc", zipHeader)), /signature/i);
});

test("rejects unsupported extensions", () => {
  assert.throws(() => validateFile(asFile("payload.pdf", zipHeader)), /supported/i);
});

test("rejects empty files", () => {
  assert.throws(() => validateFile(asFile("empty.docx", Buffer.alloc(0))), /size/i);
});
