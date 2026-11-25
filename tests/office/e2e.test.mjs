import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(join(process.env.OFFICE_E2E_TOOLS || "", "resolve.cjs"));
const { chromium } = require("playwright-core");
const base = process.env.OFFICE_E2E_URL || "http://127.0.0.1:4173";
const here = dirname(fileURLToPath(import.meta.url));
let browser;

before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function openFixture(file) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/?file=/" + file);
  await page.waitForFunction(() => window.__paperpilotOffice?.events.some((event) => event.type === "load" || event.type === "error"), null, { timeout: 30000 });
  const failure = await page.evaluate(() => window.__paperpilotOffice.events.find((event) => event.type === "error"));
  if (failure) throw new Error("Office engine load failed: " + failure.message);
  return { page, errors };
}

async function replaceDocumentText(page, selector, target, replacement) {
  const selected = await page.locator(selector).evaluate((root, text) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const offset = node.textContent.indexOf(text);
      if (offset < 0) continue;
      const range = document.createRange();
      range.setStart(node, offset);
      range.setEnd(node, offset + text.length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
    return false;
  }, target);
  assert.equal(selected, true, "editable text target must exist");
  await page.keyboard.insertText(replacement);
}

async function saveAndReopen(page) {
  const save = page.getByRole("button", { name: /^Save/i }).first();
  await save.waitFor({ state: "visible", timeout: 15000 });
  const previous = await page.evaluate(() => window.__paperpilotOffice.events.filter((event) => event.type === "save").length);
  await save.click();
  await page.waitForFunction((count) => window.__paperpilotOffice.events.filter((event) => event.type === "save").length > count, previous, { timeout: 30000 });
  const saved = await page.evaluate(async () => {
    const blob = window.__paperpilotOffice.saved;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { name: window.__paperpilotOffice.savedName, base64: btoa(binary) };
  });
  await page.evaluate(() => window.__paperpilotOffice.reopenSaved());
  await page.waitForFunction(() => window.__paperpilotOffice.events.filter((event) => event.type === "load").length >= 2, null, { timeout: 30000 });
  return saved;
}

async function inspect(bytes, name, kind) {
  const dir = await mkdtemp(join(tmpdir(), "paperpilot-office-"));
  try {
    const file = join(dir, name);
    await writeFile(file, Buffer.from(bytes, "base64"));
    execFileSync("python3", [join(here, "inspect-roundtrip.py"), file, kind], { stdio: "pipe" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("DOCX: edit, save, reopen and preserve table, image, header and footer", async () => {
  const { page, errors } = await openFixture("complex.docx");
  await page.locator(".de-pages").waitFor();
  assert.match(await page.locator(".de-pages").innerText(), /TABLE CELL PRESERVE/);
  assert.ok(await page.locator(".de-pages img").count() >= 1, "embedded DOCX image must render");
  await replaceDocumentText(page, ".de-pages", "PAPERPILOT EDIT TARGET", "PAPERPILOT EDITED");
  const saved = await saveAndReopen(page);
  await page.locator(".de-pages").waitFor();
  const reopened = await page.locator(".de-pages").innerText();
  assert.match(reopened, /PAPERPILOT EDITED/);
  assert.match(reopened, /TABLE CELL PRESERVE/);
  assert.ok(await page.locator(".de-pages img").count() >= 1, "embedded DOCX image must survive reopen");
  await inspect(saved.base64, "edited.docx", "docx");
  assert.deepEqual(errors, []);
  await page.close();
});

test("PPTX: edit, save, reopen and preserve master, notes, table and image", async () => {
  const { page, errors } = await openFixture("complex.pptx");
  await page.locator(".de-slide-frame").first().waitFor();
  assert.match(await page.locator(".de-slide-frame").first().innerText(), /SLIDE CELL KEEP/);
  assert.ok(await page.locator(".de-slide-frame img").count() >= 1, "embedded slide image must render");
  await page.locator(".de-slide-frame").first().getByText("PAPERPILOT PPTX EDIT TARGET").click();
  await page.locator(".de-txt-edit").waitFor();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("PAPERPILOT PPTX EDITED");
  await page.keyboard.press("Escape");
  const saved = await saveAndReopen(page);
  await page.locator(".de-slide-frame").first().waitFor();
  assert.match(await page.locator(".de-slide-frame").first().innerText(), /PAPERPILOT PPTX EDITED/);
  assert.match(await page.locator(".de-slide-frame").first().innerText(), /SLIDE CELL KEEP/);
  assert.ok(await page.locator(".de-slide-frame img").count() >= 1);
  await inspect(saved.base64, "edited.pptx", "pptx");
  assert.deepEqual(errors, []);
  await page.close();
});

test("malformed ZIP directory is rejected by the browser editor", async () => {
  const page = await browser.newPage();
  await page.goto(base + "/?file=/malformed-eocd.docx");
  await page.waitForFunction(() => window.__paperpilotOffice?.events.some((event) => event.type === "error"), null, { timeout: 30000 });
  const error = await page.evaluate(() => window.__paperpilotOffice.events.find((event) => event.type === "error"));
  assert.ok(error?.message, "malformed package must fail with a reported parser error");
  assert.equal(await page.locator(".de-pages").count(), 0, "malformed package must not expose an editable document canvas");
  await page.close();
});


test("IndexedDB autosave survives refresh and restores immutable source and cloud lineage", async () => {
  const page = await browser.newPage();
  await page.goto(base + "/");
  await page.waitForFunction(() => !!window.__paperpilotDraft);
  const sessionId = await page.evaluate(() => window.__paperpilotDraft.createAndSave());
  await page.reload();
  await page.waitForFunction(() => !!window.__paperpilotDraft);
  const drafts = await page.evaluate(() => window.__paperpilotDraft.list());
  const recovered = drafts.find((draft) => draft.sessionId === sessionId);
  assert.ok(recovered, "local Office draft must be discoverable after a full page reload");
  assert.equal(recovered.sourceName, "draft-source.docx", "original source name must remain preserved");
  assert.equal(recovered.latestName, "draft-revision.docx", "latest autosaved revision must be restored");
  assert.equal(recovered.latestVersion, 1);
  assert.equal(recovered.cloudDocumentId, "11111111-1111-4111-8111-111111111111");
  assert.equal(recovered.parentRevisionId, "22222222-2222-4222-8222-222222222222");
  assert.ok(recovered.latestSize > 0);
  await page.close();
});
