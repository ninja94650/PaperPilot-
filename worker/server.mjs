import express from "express";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";
import { validateOOXMLArchive } from "./archive-validation.mjs";
import { startQueueRunner } from "./queue-runner.mjs";

const app = express();
const port = Number(process.env.PORT || 8080);
const token = process.env.DOCUMENT_WORKER_TOKEN || "";
const maxFileBytes = 20 * 1024 * 1024;

export function validateFile(file) {
  const extension = extname(file.originalname).toLowerCase();
  const supported = new Set([".doc", ".docx", ".ppt", ".pptx"]);
  if (!supported.has(extension)) throw new Error("Only DOC, DOCX, PPT and PPTX files are supported.");
  if (!file.buffer?.length || file.buffer.length > maxFileBytes) throw new Error("The uploaded file size is invalid.");

  const header = file.buffer.subarray(0, 8);
  const isZip = header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
  const isOle = header.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  const modern = extension === ".docx" || extension === ".pptx";
  if ((modern && !isZip) || (!modern && !isOle)) throw new Error("The file signature does not match its Office extension.");
  if (modern) {
    validateOOXMLArchive(file.buffer, extension === ".docx" ? "word/document.xml" : "ppt/presentation.xml");
  }
  return extension;
}

function runLibreOffice(inputPath, outputDir, profileDir) {
  return new Promise((resolve, reject) => {
    const child = spawn("libreoffice", [
      "-env:UserInstallation=file://" + profileDir,
      "--headless",
      "--nologo",
      "--nodefault",
      "--nolockcheck",
      "--norestore",
      "--convert-to", "pdf",
      "--outdir", outputDir,
      inputPath
    ], {
      cwd: outputDir,
      env: { ...process.env, HOME: profileDir, TMPDIR: outputDir },
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-3000); });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(signal === "SIGKILL" ? "LibreOffice conversion timed out." : "LibreOffice could not convert this document. " + stderr.slice(-600)));
    });
  });
}

app.get("/healthz", (_req, res) => res.json({ ok: true, service: "paperpilot-converter" }));

app.post("/convert", (_req, res) => {
  res.status(410).json({ error: "Synchronous conversion is retired. Submit an authenticated processing job through PaperPilot." });
});

export function startServer() {
  if (!token || token.length < 32) {
    throw new Error("DOCUMENT_WORKER_TOKEN must be set to a random secret of at least 32 characters.");
  }
  return app.listen(port, "0.0.0.0", () => {
    process.stdout.write("PaperPilot conversion worker listening on " + port + "\\n");
    startQueueRunner();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
