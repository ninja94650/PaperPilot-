const scanResults = { clean: 0, rejected: 0, failed: 0 };
const jobResults = { succeeded: 0, failed: 0 };
const cleanupResults = { removed: 0, invalid: 0, error: 0 };
const scanDuration = { buckets: [0, 0, 0, 0, 0, 0], sum: 0, count: 0 };
const jobDuration = { buckets: [0, 0, 0, 0, 0, 0], sum: 0, count: 0 };
const durationBounds = [1, 5, 10, 30, 60, 120];
let queuePollErrors = 0;
let queuePollLastSuccess = 0;
let lastJobSuccess = 0;
let busy = 0;

function observe(histogram, seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  histogram.sum += value;
  histogram.count += 1;
  durationBounds.forEach((bound, index) => {
    if (value <= bound) histogram.buckets[index] += 1;
  });
}

export function recordScan(result, seconds) {
  if (Object.hasOwn(scanResults, result)) scanResults[result] += 1;
  observe(scanDuration, seconds);
}
export function recordJob(result, seconds) {
  if (Object.hasOwn(jobResults, result)) jobResults[result] += 1;
  observe(jobDuration, seconds);
  if (result === "succeeded") lastJobSuccess = Date.now() / 1000;
}
export function recordCleanup(result, count = 1) {
  if (Object.hasOwn(cleanupResults, result)) cleanupResults[result] += Math.max(0, Number(count) || 0);
}
export function recordQueuePollSuccess() {
  queuePollLastSuccess = Date.now() / 1000;
}
export function recordQueuePollError() {
  queuePollErrors += 1;
}
export function setWorkerBusy(value) {
  busy = value ? 1 : 0;
}

function histogram(name, help, value) {
  const lines = [
    "# HELP " + name + " " + help,
    "# TYPE " + name + " histogram"
  ];
  durationBounds.forEach((bound, index) => {
    lines.push(name + '_bucket{le="' + bound + '"} ' + value.buckets[index]);
  });
  lines.push(name + '_bucket{le="+Inf"} ' + value.count);
  lines.push(name + "_sum " + value.sum);
  lines.push(name + "_count " + value.count);
  return lines;
}

export function renderMetrics() {
  const lines = [
    "# HELP paperpilot_worker_scans_total Input and output malware scan results.",
    "# TYPE paperpilot_worker_scans_total counter",
    ...Object.entries(scanResults).map(([result, count]) => 'paperpilot_worker_scans_total{result="' + result + '"} ' + count),
    "# HELP paperpilot_worker_jobs_total Office conversion attempts completed by the worker.",
    "# TYPE paperpilot_worker_jobs_total counter",
    ...Object.entries(jobResults).map(([result, count]) => 'paperpilot_worker_jobs_total{result="' + result + '"} ' + count),
    "# HELP paperpilot_worker_output_cleanup_total Private output objects handled by the cleanup sweeper.",
    "# TYPE paperpilot_worker_output_cleanup_total counter",
    ...Object.entries(cleanupResults).map(([result, count]) => 'paperpilot_worker_output_cleanup_total{result="' + result + '"} ' + count),
    "# HELP paperpilot_worker_queue_poll_errors_total Queue polling and API communication errors.",
    "# TYPE paperpilot_worker_queue_poll_errors_total counter",
    "paperpilot_worker_queue_poll_errors_total " + queuePollErrors,
    "# HELP paperpilot_worker_queue_poll_last_success_timestamp_seconds Unix timestamp of the last successful queue poll.",
    "# TYPE paperpilot_worker_queue_poll_last_success_timestamp_seconds gauge",
    "paperpilot_worker_queue_poll_last_success_timestamp_seconds " + queuePollLastSuccess,
    "# HELP paperpilot_worker_last_job_success_timestamp_seconds Unix timestamp of the last successfully published job.",
    "# TYPE paperpilot_worker_last_job_success_timestamp_seconds gauge",
    "paperpilot_worker_last_job_success_timestamp_seconds " + lastJobSuccess,
    "# HELP paperpilot_worker_busy Whether the worker is currently executing a queue poll.",
    "# TYPE paperpilot_worker_busy gauge",
    "paperpilot_worker_busy " + busy,
    ...histogram("paperpilot_worker_scan_duration_seconds", "Duration of ClamAV scans in seconds.", scanDuration),
    ...histogram("paperpilot_worker_job_duration_seconds", "Duration of worker job attempts in seconds.", jobDuration)
  ];
  return lines.join("\n") + "\n";
}
