/**
 * Fetch a single row while enforcing ownership in the database query itself.
 * Never fetch by resource ID and rely on a later in-memory owner check.
 *
 * @param {any} supabase Authenticated Supabase client.
 * @param {string} table Database table name.
 * @param {string} columns Explicit allow-listed projection.
 * @param {string} id Resource identifier.
 * @param {string} ownerId Authenticated user's UUID.
 */
export async function selectOwnedRecord(supabase, table, columns, id, ownerId) {
  if (!supabase || typeof table !== "string" || typeof columns !== "string" ||
      typeof id !== "string" || !id || typeof ownerId !== "string" || !ownerId) {
    throw new TypeError("A client, table, projection, resource ID and owner ID are required.");
  }
  return supabase.from(table)
    .select(columns)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
}
