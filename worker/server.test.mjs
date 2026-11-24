import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { validateFile } from "./server.mjs";
import { validateOOXMLArchive } from "./archive-validation.mjs";

const oleHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const asFile = (originalname, buffer) => ({ originalname, buffer });

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const [name, contentValue, method = 0] of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const content = Buffer.from(contentValue);
    const compressed = method === 8 ? deflateRawSync(content) : content;
    const crc = crc32(content);
    const local = Buffer.alloc(30 + nameBytes.length + compressed.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);
    compressed.copy(local, 30 + nameBytes.length);
    localParts.push(local);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(localOffset, 42);
    nameBytes.copy(central, 46);
    centralParts.push(central);
    localOffset += local.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

const docxEntries = [
  ["[Content_Types].xml", "<Types/>"],
  ["word/document.xml", "<document/>"]
];
const pptxEntries = [
  ["[Content_Types].xml", "<Types/>"],
  ["ppt/presentation.xml", "<presentation/>"]
];

test("accepts DOCX and PPTX packages with required Office parts", () => {
  assert.equal(validateFile(asFile("report.docx", makeZip(docxEntries))), ".docx");
  assert.equal(validateFile(asFile("slides.PPTX", makeZip(pptxEntries))), ".pptx");
});

test("accepts legacy DOC and PPT files with OLE signatures", () => {
  assert.equal(validateFile(asFile("report.doc", oleHeader)), ".doc");
  assert.equal(validateFile(asFile("slides.PPT", oleHeader)), ".ppt");
});

test("rejects a signature that does not match the Office extension", () => {
  assert.throws(() => validateFile(asFile("report.docx", oleHeader)), /signature/i);
  assert.throws(() => validateFile(asFile("report.doc", makeZip(docxEntries))), /signature/i);
});

test("rejects unsupported extensions and empty files", () => {
  assert.throws(() => validateFile(asFile("payload.pdf", makeZip(docxEntries))), /supported/i);
  assert.throws(() => validateFile(asFile("empty.docx", Buffer.alloc(0))), /size/i);
});

test("rejects a truncated ZIP package", () => {
  assert.throws(() => validateOOXMLArchive(Buffer.from([0x50, 0x4b, 0x03, 0x04]), "word/document.xml"), /too small|ZIP directory/i);
});

test("rejects path traversal entries", () => {
  const archive = makeZip([...docxEntries, ["../escape.txt", "x"]]);
  assert.throws(() => validateOOXMLArchive(archive, "word/document.xml"), /path traversal/i);
});

test("rejects duplicate paths regardless of case", () => {
  const archive = makeZip([...docxEntries, ["WORD/document.xml", "duplicate"]]);
  assert.throws(() => validateOOXMLArchive(archive, "word/document.xml"), /duplicate/i);
});

test("rejects macro payloads in a non-macro Office extension", () => {
  const archive = makeZip([...docxEntries, ["word/vbaProject.bin", "macro"]]);
  assert.throws(() => validateOOXMLArchive(archive, "word/document.xml"), /Macro-enabled/i);
});

test("rejects packages missing the expected document part", () => {
  const archive = makeZip([["[Content_Types].xml", "<Types/>"]]);
  assert.throws(() => validateOOXMLArchive(archive, "word/document.xml"), /required Office/i);
});

test("rejects packages that exceed the entry count limit", () => {
  const many = Array.from({ length: 1_001 }, (_, index) => ["custom/" + index + ".xml", "x"]);
  assert.throws(() => validateOOXMLArchive(makeZip([...docxEntries, ...many]), "word/document.xml"), /too many entries/i);
});

test("rejects extreme ZIP compression ratios", () => {
  const archive = makeZip([...docxEntries, ["word/large.xml", "A".repeat(20_000), 8]]);
  assert.throws(() => validateOOXMLArchive(archive, "word/document.xml"), /compression-ratio/i);
});

test("rejects ZIP64 directory metadata", () => {
  const archive = makeZip(docxEntries);
  const endOffset = archive.length - 22;
  archive.writeUInt16LE(0xffff, endOffset + 8);
  archive.writeUInt16LE(0xffff, endOffset + 10);
  assert.throws(() => validateOOXMLArchive(archive, "word/document.xml"), /ZIP64/i);
});

test("rejects encrypted ZIP entries", () => {
  const archive = makeZip(docxEntries);
  const endOffset = archive.length - 22;
  const centralOffset = archive.readUInt32LE(endOffset + 16);
  archive.writeUInt16LE(0x0001, 6);
  archive.writeUInt16LE(0x0001, centralOffset + 8);
  assert.throws(() => validateOOXMLArchive(archive, "word/document.xml"), /Encrypted or unsupported ZIP flags/i);
});

test("rejects mismatched local and central directory metadata", () => {
  const archive = makeZip(docxEntries);
  archive.writeUInt32LE(123, 14);
  assert.throws(() => validateOOXMLArchive(archive, "word/document.xml"), /metadata do not match/i);
});
