import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const fixturePath = process.env.PAPERPILOT_E2E_INPUT;
if (!fixturePath) throw new Error("PAPERPILOT_E2E_INPUT must point to a synthetic DOCX fixture.");
const input = await readFile(fixturePath);
assert.ok(input.length > 100, "DOCX fixture must be non-empty");

async function freePort(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  return port;
}
async function jsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

const jobId = "8a2f6f2a-5f5e-4d53-8f24-4c7d29d4f001";
const ownerId = "6d1bba0d-6e2b-4e17-9d40-ef0f4e9c1001";
const workerId = "paperpilot-e2e-worker";
const storagePath = ownerId + "/" + jobId + "/attempt-1/result.pdf";
const token = "paperpilot-e2e-token-0123456789-abcdefghijklmnopqrstuvwxyz";
const events = [];
let storedOutput = null;
let scanClaimed = false;
let processingClaimed = false;
let completionResolve;
let completionReject;
const completion = new Promise((resolve, reject) => { completionResolve = resolve; completionReject = reject; });

const api = createHttpServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    const send = (status, body) => {
      response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify(body));
    };
    if (request.method === "GET" && url.pathname === "/fixture.docx") {
      response.writeHead(200, { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "content-length": input.length });
      response.end(input);
      return;
    }
    if (request.method === "PUT" && url.pathname === "/storage/upload") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      storedOutput = Buffer.concat(chunks);
      events.push("storage:put");
      response.writeHead(200);
      response.end("ok");
      return;
    }
    if (request.method !== "POST" || !url.pathname.startsWith("/api/internal/processing/")) {
      send(404, { error: "not found" });
      return;
    }
    assert.equal(request.headers.authorization, "Bearer " + token, "worker bearer token must be sent");
    const body = await jsonBody(request);
    const route = url.pathname.split("/").at(-1);
    events.push(route);
    if (route === "claim-scan") {
      if (scanClaimed) return send(200, { job: null });
      scanClaimed = true;
      return send(200, { job: { id: jobId, workerId, attempt: 1, inputUrl: "http://127.0.0.1:" + api.address().port + "/fixture.docx" } });
    }
    if (route === "scan-result") {
      assert.equal(body.jobId, jobId);
      assert.equal(body.workerId, workerId);
      assert.equal(body.verdict, "clean");
      return send(200, { ok: true, scanStatus: "clean", retryScheduled: false });
    }
    if (route === "claim") {
      if (processingClaimed) return send(200, { job: null });
      processingClaimed = true;
      return send(200, { job: {
        id: jobId, ownerId, documentId: "f0f0f0f0-1111-4222-8333-444444444444",
        tool: "office-to-pdf", attempt: 1,
        input: { file_name: "fixture.docx", mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size_bytes: input.length },
        inputUrl: "http://127.0.0.1:" + api.address().port + "/fixture.docx"
      } });
    }
    if (route === "cleanup-outputs") return send(200, { removed: 0, invalid: 0, errors: 0 });
    if (route === "heartbeat") return send(200, { ok: true, cancelRequested: false });
    if (route === "output-upload") {
      assert.equal(body.jobId, jobId);
      assert.equal(body.attempt, 1);
      return send(200, { storagePath, signedUrl: "http://127.0.0.1:" + api.address().port + "/storage/upload" });
    }
    if (route === "complete") {
      assert.equal(body.storagePath, storagePath);
      assert.ok(storedOutput, "output must be uploaded before completion");
      assert.equal(body.sizeBytes, storedOutput.length);
      assert.equal(storedOutput.subarray(0, 5).toString("ascii"), "%PDF-");
      events.push("revision:published");
      completionResolve({ body, outputBytes: storedOutput.length });
      return send(200, { ok: true, revisionId: "e0e0e0e0-1111-4222-8333-444444444444", version: 1, reused: false });
    }
    if (route === "fail") {
      completionReject(new Error("worker reported failure: " + JSON.stringify(body)));
      return send(200, { ok: true });
    }
    send(404, { error: "unknown route" });
  } catch (error) {
    completionReject(error);
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: String(error) }));
  }
});

const clamav = createTcpServer(socket => {
  let command = Buffer.alloc(0);
  let stream = false;
  socket.on("data", chunk => {
    command = Buffer.concat([command, chunk]);
    if (!stream && command.subarray(0, 8).toString("ascii") === "zVERSION") {
      socket.end(Buffer.from("ClamAV 1.4.0 integration-fixture\0"));
    } else if (command.subarray(0, 10).toString("ascii") === "zINSTREAM\0") {
      stream = true;
    }
  });
  socket.on("end", () => {
    if (stream) socket.end(Buffer.from("stream: OK\0"));
  });
});

const apiPort = await freePort(api);
const clamPort = await freePort(clamav);
api.listen(apiPort, "127.0.0.1");
clamav.listen(clamPort, "127.0.0.1");
await Promise.all([once(api, "listening"), once(clamav, "listening")]);

const workerPort = await freePort(createHttpServer());
const child = spawn(process.execPath, [resolve(root, "server.mjs")], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(workerPort),
    PAPERPILOT_API_URL: "http://127.0.0.1:" + apiPort,
    DOCUMENT_WORKER_TOKEN: token,
    PAPERPILOT_WORKER_ID: workerId,
    CLAMAV_HOST: "127.0.0.1",
    CLAMAV_PORT: String(clamPort),
    CONVERSION_TIMEOUT_MS: "90000"
  },
  stdio: ["ignore", "pipe", "pipe"]
});
let logs = "";
child.stdout.on("data", chunk => { logs += chunk.toString(); });
child.stderr.on("data", chunk => { logs += chunk.toString(); });
const exited = once(child, "exit");
let timeoutHandle;

try {
  const deadline = Date.now() + 120_000;
  let health = false;
  while (Date.now() < deadline && !health) {
    if (child.exitCode !== null) throw new Error("Worker exited before integration completed: " + logs);
    try {
      const result = await fetch("http://127.0.0.1:" + workerPort + "/healthz", { signal: AbortSignal.timeout(1000) });
      health = result.ok;
    } catch { await new Promise(resolveWait => setTimeout(resolveWait, 250)); }
  }
  assert.ok(health, "worker health endpoint did not become ready");
  const result = await Promise.race([
    completion,
    new Promise((_, reject) => { timeoutHandle = setTimeout(() => reject(new Error("queue-to-storage integration timed out")), 120_000); })
  ]);
  clearTimeout(timeoutHandle);
  assert.equal(result.body.jobId, jobId);
  assert.ok(result.outputBytes > 500, "converted PDF should contain a real document");
  const ready = await fetch("http://127.0.0.1:" + workerPort + "/readyz");
  assert.equal(ready.status, 200, "worker readiness should confirm the scanner is reachable");
  const metricsResponse = await fetch("http://127.0.0.1:" + workerPort + "/metrics");
  const metricsText = await metricsResponse.text();
  assert.ok(metricsText.includes('paperpilot_worker_scans_total{result="clean"} 2'));
  assert.ok(metricsText.includes('paperpilot_worker_jobs_total{result="succeeded"} 1'));
  assert.deepEqual(events.filter(event => ["scan-result", "claim", "output-upload", "storage:put", "complete", "revision:published"].includes(event)), [
    "scan-result", "claim", "output-upload", "storage:put", "complete", "revision:published"
  ]);
  assert.equal(events.includes("fail"), false);
  process.stdout.write("PASS: scanned DOCX -> LibreOffice PDF -> private object upload -> verified revision publication (" + result.outputBytes + " bytes).\n");
} catch (error) {
  process.stderr.write(logs + "\n");
  throw error;
} finally {
  clearTimeout(timeoutHandle);
  child.kill("SIGTERM");
  let exitedGracefully = false;
  await Promise.race([
    exited.then(() => { exitedGracefully = true; }),
    new Promise(resolveWait => setTimeout(resolveWait, 2000))
  ]);
  if (!exitedGracefully) child.kill("SIGKILL");
  await exited;
  api.close();
  clamav.close();
}
