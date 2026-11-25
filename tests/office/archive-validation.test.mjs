import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateOOXMLArchive } from "../../worker/archive-validation.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "e2e", "public");
const read = (name) => readFile(join(root, name));

test("accepts a real DOCX with tables, headers, footers and embedded image", async () => {
  const result = validateOOXMLArchive(await read("complex.docx"), "word/document.xml");
  assert.ok(result.entries > 5);
  assert.ok(result.expandedBytes > 0);
});

test("accepts a real PPTX with master, notes, table and embedded image", async () => {
  const result = validateOOXMLArchive(await read("complex.pptx"), "ppt/presentation.xml");
  assert.ok(result.entries > 5);
  assert.ok(result.expandedBytes > 0);
});

for (const [name, reason] of [
  ["malformed-traversal.docx", /path traversal/i],
  ["malformed-duplicate.docx", /duplicate/i],
  ["malformed-macro.docx", /macro-enabled/i],
  ["malformed-bomb.docx", /compression-ratio/i],
  ["malformed-eocd.docx", /directory record/i],
]) {
  test("rejects " + name + " before editing", async () => {
    await assert.rejects(
      async () => validateOOXMLArchive(await read(name), "word/document.xml"),
      reason
    );
  });
}
