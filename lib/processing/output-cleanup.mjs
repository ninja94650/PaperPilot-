/**
 * Classify an unreferenced output object before cleanup.
 * Only objects from an older attempt, non-running jobs, or long-expired leases
 * may be deleted. A currently leased attempt is never eligible.
 */
export function classifyOutputForCleanup(job, nowMs = Date.now(), graceMs = 300_000) {
  if (!job || typeof job.id !== "string" || typeof job.owner_id !== "string" ||
      typeof job.output_storage_path !== "string" || !Number.isInteger(Number(job.attempt_count))) {
    return { action: "invalid" };
  }
  const match = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\/attempt-(\d+)\/result\.pdf$/i.exec(job.output_storage_path);
  if (!match || match[1] !== job.owner_id || match[2] !== job.id) return { action: "invalid" };
  const outputAttempt = Number(match[3]);
  const currentAttempt = Number(job.attempt_count);
  if (outputAttempt < 1 || outputAttempt > currentAttempt) return { action: "invalid" };

  if (["queued", "failed", "cancelled"].includes(job.status)) {
    return { action: "remove", reason: "inactive-job", outputAttempt };
  }
  if (job.status !== "running") return { action: "keep" };

  if (outputAttempt < currentAttempt) {
    return { action: "remove", reason: "prior-attempt", outputAttempt };
  }

  const leaseExpiry = Date.parse(job.lease_expires_at || "");
  if (Number.isFinite(leaseExpiry) && leaseExpiry <= nowMs - graceMs) {
    return { action: "remove", reason: "expired-lease", outputAttempt };
  }
  return { action: "keep" };
}
