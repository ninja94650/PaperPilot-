import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { validateOOXMLArchive } from "./archive-validation.mjs";
import { scanWithClamAv } from "./clamav.mjs";
import { terminateProcessTree } from "./process-control.mjs";
import { recordScan, recordJob, recordCleanup, recordQueuePollError, recordQueuePollSuccess, setWorkerBusy } from "./metrics.mjs";

const api = (process.env.PAPERPILOT_API_URL || "").replace(/\/+$/, "");
const token = process.env.DOCUMENT_WORKER_TOKEN || "";
const workerId = process.env.PAPERPILOT_WORKER_ID || "office-" + randomUUID();
const timeoutMs = Number(process.env.CONVERSION_TIMEOUT_MS || 90_000);
const maxInputBytes = 20 * 1024 * 1024;
const maxOutputBytes = 40 * 1024 * 1024;
let busy = false;
let stopped = false;

async function call(path, body) {
  const response = await fetch(api + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "PaperPilot API returned " + response.status);
  return result;
}

async function download(url, limit) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error("Private input download failed.");
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > limit) throw new Error("Input exceeds the worker size limit.");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error("Input exceeds the worker size limit.");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function validateOffice(buffer, name) {
  const extension = extname(name).toLowerCase();
  if (![".doc", ".docx", ".ppt", ".pptx"].includes(extension)) throw new Error("Unsupported Office document extension.");
  if (!buffer.length || buffer.length > maxInputBytes) throw new Error("Office document size is invalid.");
  const header = buffer.subarray(0, 8);
  const zip = header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
  const ole = header.equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]));
  const modern = extension === ".docx" || extension === ".pptx";
  if ((modern && !zip) || (!modern && !ole)) throw new Error("The Office signature does not match the file extension.");
  if (modern) validateOOXMLArchive(buffer, extension === ".docx" ? "word/document.xml" : "ppt/presentation.xml");
  return extension;
}

export function convert(buffer, name, extension, signal) {
  return new Promise(async (resolve, reject) => {
    let dir;
    let child;
    let timer;
    let settled = false;
    const finish = async (error, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
      if (error) reject(error); else resolve(value);
    };
    const onAbort = () => {
      terminateProcessTree(child, "SIGKILL", process.kill, process.platform !== "win32");
      void finish(new Error("Conversion cancelled or worker lease lost."));
    };
    if (signal?.aborted) return finish(new Error("Conversion cancelled before start."));
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      dir = await mkdtemp(join(tmpdir(), "paperpilot-queue-"));
      if (signal?.aborted) return onAbort();
      const inputDir = join(dir, "input");
      const outputDir = join(dir, "output");
      const profileDir = join(dir, "profile");
      await Promise.all([mkdir(inputDir), mkdir(outputDir), mkdir(profileDir)]);
      const base = randomUUID();
      const inputPath = join(inputDir, base + extension);
      const outputPath = join(outputDir, base + ".pdf");
      await writeFile(inputPath, buffer, { flag: "wx", mode: 0o600 });
      if (signal?.aborted) return onAbort();
      child = spawn("libreoffice", [
        "-env:UserInstallation=file://" + profileDir, "--headless", "--nologo",
        "--nodefault", "--nolockcheck", "--norestore", "--convert-to", "pdf",
        "--outdir", outputDir, inputPath
      ], { cwd: outputDir, env: { ...process.env, HOME: profileDir, TMPDIR: outputDir }, stdio: ["ignore","ignore","pipe"], detached: process.platform !== "win32" });
      let stderr = "";
      child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-2000); });
      timer = setTimeout(() => {
        terminateProcessTree(child, "SIGKILL", process.kill, process.platform !== "win32");
        void finish(new Error("Office conversion exceeded its time limit."));
      }, timeoutMs);
      child.once("error", error => { void finish(error); });
      child.once("close", async code => {
        if (settled) return;
        try {
          if (signal?.aborted) throw new Error("Conversion cancelled or worker lease lost.");
          if (code !== 0) throw new Error("Office conversion failed: " + stderr.slice(-400));
          const pdf = await readFile(outputPath);
          if (pdf.length < 5 || pdf.length > maxOutputBytes || pdf.subarray(0,5).toString("ascii") !== "%PDF-") {
            throw new Error("The Office worker returned an invalid PDF.");
          }
          await finish(null, pdf);
        } catch (error) { await finish(error); }
      });
    } catch (error) {
      await finish(error);
    }
  });
}

async function scanDocument(buffer) {
  const startedAt = Date.now();
  let outcome = "failed";
  try {
    const result = await scanWithClamAv(buffer);
    outcome = result.clean ? "clean" : "rejected";
    return result;
  } finally {
    recordScan(outcome, (Date.now() - startedAt) / 1000);
  }
}

async function scanOne() {
  const claimed = await call("/api/internal/processing/claim-scan", { workerId });
  if (!claimed.job) return false;
  const job = claimed.job;
  try {
    const bytes = await download(job.inputUrl, maxInputBytes);
    const result = await scanDocument(bytes);
    await call("/api/internal/processing/scan-result", {
      jobId: job.id, workerId, attempt: job.attempt,
      verdict: result.clean ? "clean" : "rejected",
      engine: "ClamAV", signatureVersion: result.signatureVersion
    });
  } catch (error) {
    await call("/api/internal/processing/scan-result", {
      jobId: job.id, workerId, attempt: job.attempt, verdict: "failed",
      engine: "ClamAV", signatureVersion: "unavailable"
    }).catch(() => {});
    process.stderr.write("PaperPilot scan job " + job.id + " failed: " + String(error).slice(0,180) + "\n");
  }
  return true;
}

async function processOne() {
  const claimed = await call("/api/internal/processing/claim", { workerId });
  if (!claimed.job) return false;
  const job = claimed.job;
  const startedAt = Date.now();
  if (job.tool !== "office-to-pdf") {
    await call("/api/internal/processing/fail", {
      jobId: job.id, workerId, attempt: job.attempt,
      code: "unsupported_tool", message: "This worker does not support the requested tool."
    }).catch(() => {});
    recordJob("failed", (Date.now() - startedAt) / 1000);
    return true;
  }

  const beat = async (progressPercent, message) => {
    const result = await call("/api/internal/processing/heartbeat", {
      jobId: job.id, workerId, progressPercent, message
    });
    if (result.cancelRequested) throw new Error("Cancellation requested by the user.");
  };
  const controller = new AbortController();
  const heartbeat = setInterval(() => {
    beat(40, "Converting Office document").then(result => {
      if (result.cancelRequested) controller.abort();
    }).catch(() => controller.abort());
  }, 25_000);

  try {
    await call("/api/internal/processing/cleanup-outputs", { jobId: job.id, workerId, attempt: job.attempt });
    await beat(10, "Downloading private input");
    const bytes = await download(job.inputUrl, maxInputBytes);
    const name = typeof job.input?.file_name === "string" ? job.input.file_name : "document.docx";
    const extension = validateOffice(bytes, name);
    await beat(25, "Validating Office archive");
    const pdf = await convert(bytes, name, extension, controller.signal);
    await beat(80, "Scanning generated PDF");
    const scan = await scanDocument(pdf);
    if (!scan.clean) throw new Error("The generated PDF failed malware inspection.");
    await beat(95, "Publishing private output revision");
    const upload = await call("/api/internal/processing/output-upload", {
      jobId: job.id, workerId, attempt: job.attempt
    });
    const uploaded = await fetch(upload.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf", "x-upsert": "false", "cache-control": "max-age=3600" },
      body: pdf,
      cache: "no-store",
      signal: AbortSignal.timeout(90_000)
    });
    if (!uploaded.ok && uploaded.status !== 409) throw new Error("Private output upload failed with status " + uploaded.status + ".");
    await call("/api/internal/processing/complete", {
      jobId: job.id, workerId, attempt: job.attempt,
      storagePath: upload.storagePath, sizeBytes: pdf.byteLength
    });
    recordJob("succeeded", (Date.now() - startedAt) / 1000);
  } catch (error) {
    await call("/api/internal/processing/fail", {
      jobId: job.id, workerId, attempt: job.attempt,
      code: "worker_processing_error",
      message: String(error instanceof Error ? error.message : error).slice(0,350)
    }).catch(() => {});
    process.stderr.write("PaperPilot processing job " + job.id + " failed: " + String(error).slice(0,180) + "\n");
    recordJob("failed", (Date.now() - startedAt) / 1000);
  } finally {
    clearInterval(heartbeat);
    controller.abort();
  }
  return true;
}

let lastOutputCleanupAt = 0;

async function sweepOrphanedOutputs() {
  if (Date.now() - lastOutputCleanupAt < 60_000) return;
  lastOutputCleanupAt = Date.now();
  try {
    const result = await call("/api/internal/processing/cleanup-outputs", { limit: 50 });
    recordCleanup("removed", result.removed);
    recordCleanup("invalid", result.invalid);
    recordCleanup("error", result.errors);
    if (result.removed || result.invalid || result.errors) {
      process.stdout.write("PaperPilot output cleanup: " + JSON.stringify(result) + "\n");
    }
  } catch (error) {
    recordCleanup("error", 1);
    process.stderr.write("PaperPilot output cleanup sweep failed: " + String(error).slice(0,180) + "\n");
  }
}

export function startQueueRunner() {
  if (!api || !token || token.length < 32) {
    process.stdout.write("PaperPilot queue polling disabled; set PAPERPILOT_API_URL and DOCUMENT_WORKER_TOKEN.\n");
    return;
  }
  const poll = async () => {
    if (stopped || busy) return;
    busy = true;
    setWorkerBusy(true);
    try {
      await sweepOrphanedOutputs();
      const scanned = await scanOne();
      if (!scanned) await processOne();
      recordQueuePollSuccess();
    } catch (error) {
      recordQueuePollError();
      process.stderr.write("PaperPilot queue poll failed: " + String(error).slice(0,180) + "\n");
    } finally {
      busy = false;
      setWorkerBusy(false);
      if (!stopped) setTimeout(poll, 2_000);
    }
  };
  process.once("SIGTERM", () => { stopped = true; });
  process.once("SIGINT", () => { stopped = true; });
  void poll();
}
