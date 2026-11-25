export function selectOwnedRecord(
  supabase: unknown,
  table: string,
  columns: string,
  resourceId: string,
  ownerId: string,
  resourceColumn?: "id" | "processing_job_id"
): Promise<{ data: any; error: any }>;
