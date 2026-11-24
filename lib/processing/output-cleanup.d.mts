export type OutputCleanupClassification =
  | { action: "invalid" | "keep" }
  | { action: "remove"; reason: "inactive-job" | "prior-attempt" | "expired-lease"; outputAttempt: number };
export function classifyOutputForCleanup(
  job: unknown,
  nowMs?: number,
  graceMs?: number
): OutputCleanupClassification;
