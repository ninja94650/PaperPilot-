import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { validateOOXMLArchive } from "./archive-validation.mjs";
import { scanWithClamAv } from "./clamav.mjs";

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

function convert(buffer, name, extension) {
  return new Promise(async (resolve, reject) => {
    let dir;
    try {
      dir = await mkdtemp(join(tmpdir(), "paperpilot-queue-"));
      const inputDir = join(dir, "input");
      const outputDir = join(dir, "output");
      const profileDir = join(dir, "profile");
      await Promise.all([mkdir(inputDir), mkdir(outputDir), mkdir(profileDir)]);
      const base = randomUUID();
      const inputPath = join(inputDir, base + extension);
      const outputPath = join(outputDir, base + ".pdf");
      await writeFile(inputPath, buffer, { flag: "wx", mode: 0o600 });
      const child = spawn("libreoffice", [
        "-env:UserInstallation=file://" + profileDir, "--headless", "--nologo",
        "--nodefault", "--nolockcheck", "--norestore", "--convert-to", "pdf",
        "--outdir", outputDir, inputPath
      ], { cwd: outputDir, env: { ...process.env, HOME: profileDir, TMPDIR: outputDir }, stdio: ["ignore","ignore","pipe"] });
      let stderr = "";
      child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-2000); });
      const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
      child.once("error", reject);
      child.once("close", async code => {
        clearTimeout(timer);
        try {
          if (code !== 0) throw new Error("Office conversion failed: " + stderr.slice(-400));
          const pdf = await readFile(outputPath);
          if (pdf.length < 5 || pdf.length > maxOutputBytes || pdf.subarray(0,5).toString("ascii") !== "%PDF-") {
            throw new Error("The Office worker returned an invalid PDF.");
          }
          resolve(pdf);
        } catch (error) { reject(error); }
        finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
      });
    } catch (error) {
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
      reject(error);
    }
  });
}

async function scanOne() {
  const claimed = await call("/api/internal/processing/claim-scan", { workerId });
  if (!claimed.job) return false;
  const job = claimed.job;
  try {
    const bytes = await download(job.inputUrl, maxInputBytes);
    const result = await scanWithClamAv(bytes);
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
  if (job.tool !== "office-to-pdf") {
    await call("/api/internal/processing/fail", {
      jobId: job.id, workerId, attempt: job.attempt,
      code: "unsupported_tool", message: "This worker does not support the requested tool."
    }).catch(() => {});
    return true;
  }

  const beat = async (progressPercent, message) => {
    const result = await call("/api/internal/processing/heartbeat", {
      jobId: job.id, workerId, progressPercent, message
    });
    if (result.cancelRequested) throw new Error("Cancellation requested by the user.");
  };
  const heartbeat = setInterval(() => {
    beat(40, "Converting Office document").catch(() => {});
  }, 25_000);

  try {
    await beat(10, "Downloading private input");
    const bytes = await download(job.inputUrl, maxInputBytes);
    const name = typeof job.input?.file_name === "string" ? job.input.file_name : "document.docx";
    const extension = validateOffice(bytes, name);
    await beat(25, "Validating Office archive");
    const pdf = await convert(bytes, name, extension);
    await beat(80, "Scanning generated PDF");
    const scan = await scanWithClamAv(pdf);
    if (!scan.clean) throw new Error("The generated PDF failed malware inspection.");
    await beat(95, "Publishing private output revision");
    const form = new FormData();
    form.append("jobId", job.id);
    form.append("workerId", workerId);
    form.append("attempt", String(job.attempt));
    form.append("file", new Blob([pdf], { type: "application/pdf" }), "result.pdf");
    const response = await fetch(api + "/api/internal/processing/complete", {
      method: "POST", headers: { Authorization: "Bearer " + token }, body: form,
      cache: "no-store", signal: AbortSignal.timeout(45_000)
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Output publication failed.");
    }
  } catch (error) {
    await call("/api/internal/processing/fail", {
      jobId: job.id, workerId, attempt: job.attempt,
      code: "worker_processing_error",
      message: String(error instanceof Error ? error.message : error).slice(0,350)
    }).catch(() => {});
    process.stderr.write("PaperPilot processing job " + job.id + " failed: " + String(error).slice(0,180) + "\n");
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}

export function startQueueRunner() {
  if (!api || !token || token.length < 32) {
    process.stdout.write("PaperPilot queue polling disabled; set PAPERPILOT_API_URL and DOCUMENT_WORKER_TOKEN.\n");
    return;
  }
  const poll = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const scanned = await scanOne();
      if (!scanned) await processOne();
    } catch (error) {
      process.stderr.write("PaperPilot queue poll failed: " + String(error).slice(0,180) + "\n");
    } finally {
      busy = false;
      if (!stopped) setTimeout(poll, 2_000);
    }
  };
  process.once("SIGTERM", () => { stopped = true; });
  process.once("SIGINT", () => { stopped = true; });
  void poll();
}
