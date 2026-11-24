import express from "express";
import multer from "multer";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { validateOOXMLArchive } from "./archive-validation.mjs";

const app = express();
const port = Number(process.env.PORT || 8080);
const token = process.env.DOCUMENT_WORKER_TOKEN || "";
const maxFileBytes = 20 * 1024 * 1024;
const maxOutputBytes = 40 * 1024 * 1024;
const maxConcurrentJobs = Number(process.env.MAX_CONCURRENT_JOBS || 2);
const timeoutMs = Number(process.env.CONVERSION_TIMEOUT_MS || 90_000);
let activeJobs = 0;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileBytes, files: 1, fields: 2 }
});

function secureTokenEqual(value) {
  if (typeof value !== "string") return false;
  const left = Buffer.from(value);
  const right = Buffer.from(token);
  return left.length === right.length && timingSafeEqual(left, right);
}

function authorize(req, res, next) {
  const authorization = req.get("authorization") || "";
  const supplied = authorization.replace(/^Bearer\\s+/i, "");
  if (!secureTokenEqual(supplied)) return res.status(401).json({ error: "Unauthorized worker request." });
  next();
}

function reserveJob(req, res, next) {
  if (activeJobs >= maxConcurrentJobs) return res.status(429).json({ error: "The conversion queue is busy. Retry shortly." });
  activeJobs += 1;
  req.paperPilotJobReserved = true;
  next();
}

function parseUpload(req, res, next) {
  upload.single("file")(req, res, (error) => {
    if (error) {
      if (req.paperPilotJobReserved) activeJobs = Math.max(0, activeJobs - 1);
      req.paperPilotJobReserved = false;
      return next(error);
    }
    next();
  });
}

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

app.post("/convert", authorize, reserveJob, parseUpload, async (req, res) => {
  let jobDir;
  try {
    if (!req.file) return res.status(400).json({ error: "Multipart file field 'file' is required." });
    const extension = validateFile(req.file);
    jobDir = await mkdtemp(join(tmpdir(), "paperpilot-"));
    const inputDir = join(jobDir, "input");
    const outputDir = join(jobDir, "output");
    const profileDir = join(jobDir, "profile");
    await Promise.all([mkdir(inputDir), mkdir(outputDir), mkdir(profileDir)]);
    const base = randomUUID();
    const inputPath = join(inputDir, base + extension);
    const outputPath = join(outputDir, base + ".pdf");
    await writeFile(inputPath, req.file.buffer, { flag: "wx", mode: 0o600 });

    await runLibreOffice(inputPath, outputDir, profileDir);
    const pdf = await readFile(outputPath);
    if (pdf.length < 5 || pdf.length > maxOutputBytes || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("LibreOffice returned an invalid or oversized PDF.");
    }

    res.status(200).set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="paperpilot-converted.pdf"',
      "Cache-Control": "no-store",
      "Content-Length": String(pdf.length)
    }).send(pdf);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Conversion failed.";
    const status = /signature|supported|size|field|package|archive|ZIP/i.test(message) ? 415 : 500;
    if (!res.headersSent) res.status(status).json({ error: message });
  } finally {
    activeJobs = Math.max(0, activeJobs - 1);
    if (jobDir) await rm(jobDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.use((error, _req, res, _next) => {
  const status = error?.code === "LIMIT_FILE_SIZE" ? 413 : 400;
  res.status(status).json({ error: status === 413 ? "Files must be 20 MB or smaller." : "The multipart upload is invalid." });
});

export function startServer() {
  if (!token || token.length < 32) {
    throw new Error("DOCUMENT_WORKER_TOKEN must be set to a random secret of at least 32 characters.");
  }
  return app.listen(port, "0.0.0.0", () => {
    process.stdout.write("PaperPilot conversion worker listening on " + port + "\\n");
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
