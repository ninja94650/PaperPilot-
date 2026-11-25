import test from "node:test";
import assert from "node:assert/strict";
import {
  recordScan, recordJob, recordCleanup, recordQueuePollError,
  recordQueuePollSuccess, setWorkerBusy, renderMetrics
} from "./metrics.mjs";

test("exports bounded, low-cardinality Prometheus metrics without document identifiers", () => {
  recordScan("clean", 2.5);
  recordScan("rejected", 8);
  recordJob("succeeded", 18);
  recordJob("failed", 121);
  recordCleanup("removed", 2);
  recordCleanup("error", 1);
  recordQueuePollError();
  recordQueuePollSuccess();
  setWorkerBusy(true);

  const metrics = renderMetrics();
  assert.match(metrics, /paperpilot_worker_scans_total\{result="clean"\} 1/);
  assert.match(metrics, /paperpilot_worker_scans_total\{result="rejected"\} 1/);
  assert.match(metrics, /paperpilot_worker_jobs_total\{result="succeeded"\} 1/);
  assert.match(metrics, /paperpilot_worker_output_cleanup_total\{result="removed"\} 2/);
  assert.match(metrics, /paperpilot_worker_queue_poll_errors_total 1/);
  assert.match(metrics, /paperpilot_worker_busy 1/);
  assert.match(metrics, /paperpilot_worker_scan_duration_seconds_bucket\{le="5"\} 1/);
  assert.match(metrics, /paperpilot_worker_job_duration_seconds_bucket\{le="\+Inf"\} 2/);
  assert.doesNotMatch(metrics, /user-a|job-a|signedUrl|Bearer /);
});
