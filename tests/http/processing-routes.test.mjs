import { mock, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const state = {
  user: { id: "user-a" },
  authError: null,
  authConfigured: true,
  rate: { allowed: true, retryAfterSeconds: 60 },
  owned: {},
  ownedCalls: [],
  events: [{ event_type: "created", status: "queued", progress_percent: 0, message: "created", created_at: "2026-01-01T00:00:00Z" }],
  document: { id: "11111111-1111-4111-8111-111111111111", name: "source.docx", mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size_bytes: 1024, storage_path: "user-a/doc-a/source.docx", status: "ready" },
  existing: null,
  insertedJob: { id: "job-new", status: "queued", progress_percent: 0, created_at: "2026-01-01T00:00:00Z" },
  cancelledJob: { id: "job-a", status: "cancelled", cancel_requested_at: "2026-01-01T00:00:00Z", progress_message: "Cancelled" },
  signed: { signedUrl: "https://private.example/signed" },
  signedCalls: 0,
  signedError: null,
  adminConfigured: true,
  adminWrites: []
};

function resultChain(result) {
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    gt() { return chain; },
    order() { return chain; },
    limit() { return chain; },
    insert(value) { state.adminWrites.push({ kind: "insert", value }); return chain; },
    update(value) { state.adminWrites.push({ kind: "update", value }); return chain; },
    maybeSingle: async () => result,
    single: async () => result,
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); }
  };
  return chain;
}
const client = {
  auth: { getUser: async () => ({ data: { user: state.user }, error: state.authError }) },
  from(table) {
    if (table === "processing_job_events") return resultChain({ data: state.events, error: null });
    if (table === "documents") return resultChain({ data: state.document, error: null });
    return resultChain({ data: null, error: null });
  },
  storage: {
    from() {
      return {
        createSignedUrl: async () => { state.signedCalls += 1; return { data: state.signed, error: state.signedError }; }
      };
    }
  }
};
const admin = {
  from(table) {
    if (table === "processing_jobs") {
      return {
        select() { return resultChain({ data: state.existing, error: null }); },
        insert(value) {
          state.adminWrites.push({ table, kind: "insert", value });
          return { select: () => ({ single: async () => ({ data: state.insertedJob, error: null }) }) };
        },
        update(value) {
          state.adminWrites.push({ table, kind: "update", value });
          return {
            eq() { return this; },
            select() { return this; },
            maybeSingle: async () => ({ data: state.cancelledJob, error: null })
          };
        }
      };
    }
    return {
      insert(value) {
        state.adminWrites.push({ table, kind: "insert", value });
        return Promise.resolve({ error: null });
      }
    };
  }
};

mock.module("@/lib/supabase/server", {
  namedExports: { createClient: async () => {
    if (!state.authConfigured) throw new Error("missing Supabase configuration");
    return client;
  } }
});
mock.module("@/lib/supabase/admin", {
  namedExports: { createAdminClient: () => {
    if (!state.adminConfigured) throw new Error("missing service role");
    return admin;
  } }
});
mock.module("@/lib/processing/rate-limit", {
  namedExports: { consumeProcessingRateLimit: async () => state.rate }
});
mock.module("@/lib/processing/owned-query.mjs", {
  namedExports: {
    selectOwnedRecord: async (_client, table, _columns, id, ownerId, resourceColumn = "id") => {
      state.ownedCalls.push({ table, id, ownerId, resourceColumn });
      return { data: state.owned[table + ":" + id + ":" + resourceColumn] ?? null, error: null };
    }
  }
});

const jobsRoute = await import("../../app/api/processing/jobs/route.ts");
const statusRoute = await import("../../app/api/processing/jobs/[id]/route.ts");
const cancelRoute = await import("../../app/api/processing/jobs/[id]/cancel/route.ts");
const downloadRoute = await import("../../app/api/processing/jobs/[id]/download/route.ts");

const internalRoutes = await Promise.all([
  import("../../app/api/internal/processing/claim/route.ts"),
  import("../../app/api/internal/processing/claim-scan/route.ts"),
  import("../../app/api/internal/processing/heartbeat/route.ts"),
  import("../../app/api/internal/processing/fail/route.ts"),
  import("../../app/api/internal/processing/scan-result/route.ts"),
  import("../../app/api/internal/processing/output-upload/route.ts"),
  import("../../app/api/internal/processing/complete/route.ts"),
  import("../../app/api/internal/processing/cleanup-outputs/route.ts"),\n  import("../../app/api/internal/editor-revisions/claim-scan/route.ts"),\n  import("../../app/api/internal/editor-revisions/scan-result/route.ts")
]);

function request(url, method = "GET", body) {
  return new Request("http://localhost" + url, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
function context(id = "job-a") { return { params: Promise.resolve({ id }) }; }
function reset() {
  state.user = { id: "user-a" };
  state.authError = null;
  state.authConfigured = true;
  state.rate = { allowed: true, retryAfterSeconds: 60 };
  state.owned = {};
  state.ownedCalls = [];
  state.adminWrites = [];
  state.document = { id: "11111111-1111-4111-8111-111111111111", name: "source.docx", mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size_bytes: 1024, storage_path: "user-a/doc-a/source.docx", status: "ready" };
  state.existing = null;
  state.signed = { signedUrl: "https://private.example/signed" };
  state.signedError = null;
  state.signedCalls = 0;
  state.adminConfigured = true;
  delete process.env.DOCUMENT_WORKER_TOKEN;
}
beforeEach(reset);

test("job status rejects anonymous requests and hides cross-tenant IDs", async () => {
  state.user = null;
  let response = await statusRoute.GET(request("/api/processing/jobs/job-a"), context());
  assert.equal(response.status, 401);

  state.user = { id: "user-a" };
  response = await statusRoute.GET(request("/api/processing/jobs/job-b"), context("job-b"));
  assert.equal(response.status, 404);
  assert.deepEqual(state.ownedCalls[0], { table: "processing_jobs", id: "job-b", ownerId: "user-a", resourceColumn: "id" });
});

test("job status returns only owner-scoped events and disables caching", async () => {
  state.owned["processing_jobs:job-a:id"] = { id: "job-a", status: "queued", progress_percent: 25 };
  const response = await statusRoute.GET(request("/api/processing/jobs/job-a"), context());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json();
  assert.equal(body.job.id, "job-a");
  assert.equal(body.events.length, 1);
});

test("job status fails closed when rate-limit protection is unavailable or exhausted", async () => {
  state.rate = { allowed: false, retryAfterSeconds: 17 };
  const response = await statusRoute.GET(request("/api/processing/jobs/job-a"), context());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "17");
});

test("job creation requires authentication and rejects a document outside the caller's tenant", async () => {
  state.user = null;
  let response = await jobsRoute.POST(request("/api/processing/jobs", "POST", {
    documentId: "11111111-1111-4111-8111-111111111111", tool: "office-to-pdf", idempotencyKey: "request-1234"
  }));
  assert.equal(response.status, 401);

  state.user = { id: "user-a" };
  state.document = null;
  response = await jobsRoute.POST(request("/api/processing/jobs", "POST", {
    documentId: "22222222-2222-4222-8222-222222222222", tool: "office-to-pdf", idempotencyKey: "request-1234"
  }));
  assert.equal(response.status, 404);
});

test("job creation validates payload, reuses idempotency keys and inserts owner-bound jobs", async () => {
  let response = await jobsRoute.POST(request("/api/processing/jobs", "POST", {
    documentId: "11111111-1111-4111-8111-111111111111", tool: "unsupported", idempotencyKey: "request-1234"
  }));
  assert.equal(response.status, 400);

  state.existing = { id: "job-existing", document_id: "11111111-1111-4111-8111-111111111111", tool: "office-to-pdf", status: "queued" };
  response = await jobsRoute.POST(request("/api/processing/jobs", "POST", {
    documentId: "11111111-1111-4111-8111-111111111111", tool: "office-to-pdf", idempotencyKey: "request-1234"
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reused, true);

  state.existing = null;
  response = await jobsRoute.POST(request("/api/processing/jobs", "POST", {
    documentId: "11111111-1111-4111-8111-111111111111", tool: "office-to-pdf", idempotencyKey: "request-5678"
  }));
  assert.equal(response.status, 202);
  assert.equal(state.adminWrites.find(item => item.table === "processing_jobs" && item.kind === "insert").value.owner_id, "user-a");
});

test("cancellation hides cross-tenant IDs and conditionally updates an owned queued job", async () => {
  let response = await cancelRoute.POST(request("/api/processing/jobs/job-b/cancel", "POST", {}), context("job-b"));
  assert.equal(response.status, 404);

  state.owned["processing_jobs:job-a:id"] = { id: "job-a", status: "queued" };
  response = await cancelRoute.POST(request("/api/processing/jobs/job-a/cancel", "POST", {}), context());
  assert.equal(response.status, 202);
  assert.equal(state.adminWrites.find(item => item.kind === "update").value.status, "cancelled");
});

test("download never signs a cross-tenant output and returns a short-lived private URL for the owner", async () => {
  let response = await downloadRoute.GET(request("/api/processing/jobs/job-b/download"), context("job-b"));
  assert.equal(response.status, 404);
  assert.equal(state.signedCalls, 0);

  state.owned["processing_jobs:job-a:id"] = { id: "job-a", status: "succeeded", document_id: "11111111-1111-4111-8111-111111111111" };
  state.owned["document_revisions:job-a:processing_job_id"] = { storage_path: "user-a/job-a/attempt-1/result.pdf", mime_type: "application/pdf", version: 1 };
  response = await downloadRoute.GET(request("/api/processing/jobs/job-a/download"), context());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await response.json()).url, "https://private.example/signed");
});

test("worker-only processing endpoints reject missing bearer credentials before touching storage", async () => {
  for (const route of internalRoutes) {
    const response = await route.POST(request("/api/internal/processing", "POST", {}));
    assert.equal(response.status, 401);
  }
});

test("worker-only processing endpoints reject short and incorrect bearer tokens", async () => {
  process.env.DOCUMENT_WORKER_TOKEN = "a-valid-token-that-is-long-enough-to-be-a-secret";
  for (const authorization of ["Bearer wrong-token", "Basic a-valid-token-that-is-long-enough-to-be-a-secret"]) {
    for (const route of internalRoutes) {
      const response = await route.POST(new Request("http://localhost/api/internal/processing", {
        method: "POST", headers: { authorization, "content-type": "application/json" }, body: "{}"
      }));
      assert.equal(response.status, 401);
    }
  }
});
