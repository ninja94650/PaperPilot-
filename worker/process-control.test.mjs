import test from "node:test";
import assert from "node:assert/strict";
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
