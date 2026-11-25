import test from "node:test";
import assert from "node:assert/strict";
import { classifyOutputForCleanup } from "../../lib/processing/output-cleanup.mjs";

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const base = {
  id: jobId,
  owner_id: owner,
  status: "running",
  attempt_count: 2,
  lease_expires_at: new Date(2_000_000).toISOString(),
  output_storage_path: owner + "/" + jobId + "/attempt-1/result.pdf"
};

test("removes a prior attempt object while a newer attempt is running", () => {
  assert.deepEqual(classifyOutputForCleanup(base, 1_000_000), {
    action: "remove", reason: "prior-attempt", outputAttempt: 1
  });
});

test("keeps the current attempt output while its lease is active", () => {
  const job = { ...base, output_storage_path: owner + "/" + jobId + "/attempt-2/result.pdf" };
  assert.deepEqual(classifyOutputForCleanup(job, 1_000_000), { action: "keep" });
});

test("keeps a recently expired current-attempt object during upload grace period", () => {
  const job = {
    ...base,
    output_storage_path: owner + "/" + jobId + "/attempt-2/result.pdf",
    lease_expires_at: new Date(950_000).toISOString()
  };
  assert.deepEqual(classifyOutputForCleanup(job, 1_000_000, 300_000), { action: "keep" });
});

test("removes a current-attempt object after the lease expiry grace period", () => {
  const job = {
    ...base,
    output_storage_path: owner + "/" + jobId + "/attempt-2/result.pdf",
    lease_expires_at: new Date(600_000).toISOString()
  };
  assert.deepEqual(classifyOutputForCleanup(job, 1_000_000, 300_000), {
    action: "remove", reason: "expired-lease", outputAttempt: 2
  });
});

test("removes stale outputs for queued, failed and cancelled jobs", () => {
  for (const status of ["queued", "failed", "cancelled"]) {
    assert.equal(classifyOutputForCleanup({ ...base, status }).action, "remove");
  }
});

test("never deletes a path belonging to another user or job", () => {
  assert.deepEqual(classifyOutputForCleanup({
    ...base, output_storage_path: "cccccccc-cccc-4ccc-8ccc-cccccccccccc/" + jobId + "/attempt-1/result.pdf"
  }), { action: "invalid" });
  assert.deepEqual(classifyOutputForCleanup({
    ...base, output_storage_path: owner + "/cccccccc-cccc-4ccc-8ccc-cccccccccccc/attempt-1/result.pdf"
  }), { action: "invalid" });
});

test("never deletes a path claiming a future attempt", () => {
  assert.deepEqual(classifyOutputForCleanup({
    ...base, output_storage_path: owner + "/" + jobId + "/attempt-3/result.pdf"
  }), { action: "invalid" });
});
