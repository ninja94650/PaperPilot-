export type ProcessingRateLimitBucket =
  | "job:create"
  | "job:status"
  | "job:cancel"
  | "job:download"
  | "editor:revision";

export type ProcessingRateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export async function consumeProcessingRateLimit(
  supabase: any,
  bucket: ProcessingRateLimitBucket
): Promise<ProcessingRateLimitResult> {
  const { data, error } = await supabase.rpc("consume_processing_api_rate_limit", {
    p_bucket: bucket
  });
  if (error) throw new Error("Processing API rate limit check is unavailable.");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.allowed !== "boolean") {
    throw new Error("Processing API rate limit returned an invalid response.");
  }
  return {
    allowed: row.allowed,
    remaining: Number(row.remaining) || 0,
    retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds) || 60)
  };
}
