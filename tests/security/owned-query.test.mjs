import test from "node:test";
import assert from "node:assert/strict";
import { selectOwnedRecord } from "../../lib/processing/owned-query.mjs";

function fakeSupabase(rowsByTable) {
  const traces = [];
  return {
    traces,
    from(table) {
      const trace = { table, projection: null, filters: [] };
      traces.push(trace);
      const query = {
        select(columns) { trace.projection = columns; return query; },
        eq(column, value) { trace.filters.push([column, value]); return query; },
        async maybeSingle() {
          const rows = rowsByTable[table] ?? [];
          const matches = rows.filter(row => trace.filters.every(([key, value]) => row[key] === value));
          if (matches.length > 1) return { data: null, error: { code: "PGRST116" } };
          return { data: matches[0] ?? null, error: null };
        }
      };
      return query;
    }
  };
}

test("owner-scoped lookup returns the caller's job and applies owner filter in query", async () => {
  const db = fakeSupabase({ processing_jobs: [
    { id: "job-a", owner_id: "user-a", status: "succeeded" },
    { id: "job-b", owner_id: "user-b", status: "succeeded" }
  ] });
  const result = await selectOwnedRecord(db, "processing_jobs", "id,status", "job-a", "user-a");
  assert.deepEqual(result.data, { id: "job-a", owner_id: "user-a", status: "succeeded" });
  assert.deepEqual(db.traces[0].filters, [["id", "job-a"], ["owner_id", "user-a"]]);
});

test("foreign user's job ID is indistinguishable from a missing job", async () => {
  const db = fakeSupabase({ processing_jobs: [
    { id: "secret-job", owner_id: "user-b", status: "succeeded" }
  ] });
  const result = await selectOwnedRecord(db, "processing_jobs", "id,status", "secret-job", "user-a");
  assert.equal(result.data, null);
  assert.equal(result.error, null);
  assert.deepEqual(db.traces[0].filters, [["id", "secret-job"], ["owner_id", "user-a"]]);
});

test("foreign user's immutable revision cannot be resolved for download", async () => {
  const db = fakeSupabase({ document_revisions: [
    { processing_job_id: "job-b", owner_id: "user-b", storage_path: "user-b/private.pdf" }
  ] });
  const result = await selectOwnedRecord(
    db, "document_revisions", "storage_path,mime_type,version", "job-b", "user-a", "processing_job_id"
  );
  assert.equal(result.data, null);
  assert.deepEqual(db.traces[0].filters, [["processing_job_id", "job-b"], ["owner_id", "user-a"]]);
});

test("rejects missing owner, resource identifiers and unsafe resource columns", async () => {
  const db = fakeSupabase({});
  await assert.rejects(selectOwnedRecord(db, "processing_jobs", "id", "job-a", ""), TypeError);
  await assert.rejects(selectOwnedRecord(db, "processing_jobs", "id", "", "user-a"), TypeError);
  await assert.rejects(selectOwnedRecord(db, "processing_jobs", "id", "job-a", "user-a", "owner_id;drop table"), TypeError);
  assert.equal(db.traces.length, 0);
});
