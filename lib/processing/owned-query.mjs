/**
 * Fetch a single row while enforcing ownership in the database query itself.
 * Never fetch by resource ID and rely on a later in-memory owner check.
 *
 * @param {any} supabase Authenticated Supabase client.
 * @param {string} table Database table name.
 * @param {string} columns Explicit allow-listed projection.
 * @param {string} resourceId Resource identifier.
 * @param {string} ownerId Authenticated user's UUID.
 * @param {string} resourceColumn Identifier column (e.g. id or processing_job_id).
 */
export async function selectOwnedRecord(supabase, table, columns, resourceId, ownerId, resourceColumn = "id") {
  if (!supabase || typeof table !== "string" || typeof columns !== "string" ||
      typeof resourceId !== "string" || !resourceId || typeof ownerId !== "string" || !ownerId ||
      !["id", "processing_job_id"].includes(resourceColumn)) {
    throw new TypeError("A client, table, projection, resource ID and owner ID are required.");
  }
  return supabase.from(table)
    .select(columns)
    .eq(resourceColumn, resourceId)
    .eq("owner_id", ownerId)
    .maybeSingle();
}
