import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { terminateProcessTree } from "./process-control.mjs";

test("terminates the detached process group, not only the LibreOffice parent", () => {
  const calls = [];
  const child = { pid: 4321, kill: () => { throw new Error("fallback should not run"); } };
  const result = terminateProcessTree(child, "SIGKILL", (pid, signal) => calls.push([pid, signal]), true);
  assert.equal(result, true);
  assert.deepEqual(calls, [[-4321, "SIGKILL"]]);
});

test("falls back to child.kill when process groups are unavailable", () => {
  const calls = [];
  const child = { pid: 4321, kill: (signal) => { calls.push(signal); return true; } };
  assert.equal(terminateProcessTree(child, "SIGTERM", () => {}, false), true);
  assert.deepEqual(calls, ["SIGTERM"]);
});

test("does not throw when the process group has already exited", () => {
  const child = { pid: 4321, kill: () => true };
  const result = terminateProcessTree(child, "SIGKILL", () => {
    const error = new Error("already exited");
    error.code = "ESRCH";
    throw error;
  }, true);
  assert.equal(result, false);
});

function processIsRunning(pid) {
  try {
    const stat = requireProcessStat(pid);
    return stat !== "Z";
  } catch {
    return false;
  }
}

function requireProcessStat(pid) {
  const fs = process.getBuiltinModule("node:fs");
  const stat = fs.readFileSync("/proc/" + pid + "/stat", "utf8");
  return stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
}

async function waitFor(check, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return check();
}

test("kills a spawned descendant when the detached worker process group is cancelled", {
  skip: process.platform !== "linux"
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "paperpilot-process-tree-"));
  const childPidFile = join(directory, "descendant.pid");
  const script = [
    'const { spawn } = require("node:child_process");',
    'const fs = require("node:fs");',
    'const descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
    'fs.writeFileSync(process.argv[1], String(descendant.pid));',
    'setInterval(() => {}, 1000);'
  ].join("\n");
  let worker;
  try {
    worker = spawn(process.execPath, ["-e", script, childPidFile], {
      detached: true,
      stdio: "ignore"
    });
    const deadline = Date.now() + 3000;
    let descendantPid;
    while (Date.now() < deadline && !descendantPid) {
      try {
        descendantPid = Number((await readFile(childPidFile, "utf8")).trim());
      } catch {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    assert.ok(Number.isInteger(descendantPid) && descendantPid > 0, "worker did not publish descendant PID");
    const workerClosed = once(worker, "close");
    assert.equal(terminateProcessTree(worker, "SIGKILL", process.kill, true), true);
    await Promise.race([workerClosed, new Promise(resolve => setTimeout(resolve, 2000))]);
    assert.equal(await waitFor(() => !processIsRunning(descendantPid)), true, "descendant survived process-group cancellation");
  } finally {
    if (worker?.pid) {
      try { process.kill(-worker.pid, "SIGKILL"); } catch {}
    }
    await rm(directory, { recursive: true, force: true });
  }
});
