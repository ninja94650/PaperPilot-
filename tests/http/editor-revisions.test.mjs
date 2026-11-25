import { mock, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOCUMENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REVISION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const state = {
  user: { id: OWNER },
  authError: null,
  authConfigured: true,
  rate: { allowed: true, retryAfterSeconds: 60 },
  document: { id: DOCUMENT, owner_id: OWNER, status: "uploaded", mime_type: WORD_MIME },
  revisions: [],
  object: new Blob(["not-a-zip"]),
  objectError: null,
  removed: [],
  published: [{ revision_id: REVISION, revision_version: 1 }],
  publishError: null,
  signed: { signedUrl: "https://private.example/revision" },
  signedCalls: 0
};

function chain(result) {
  const value = {
    select() { return value; },
    eq() { return value; },
    order() { return value; },
    limit() { return value; },
    maybeSingle: async () => result,
    single: async () => result,
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); }
  };
  return value;
}

const client = {
  auth: { getUser: async () => ({ data: { user: state.user }, error: state.authError }) },
  from(table) {
    if (table === "documents") return chain({ data: state.document, error: null });
    if (table === "editor_revisions") return chain({ data: state.revisions, error: null });
    return chain({ data: null, error: null });
  },
  storage: {
    from() {
      return {
        createSignedUrl: async () => {
          state.signedCalls += 1;
          return { data: state.signed, error: null };
        }
      };
    }
  }
};
const admin = {
  from(table) {
    if (table === "documents") return chain({ data: state.document, error: null });
    return chain({ data: null, error: null });
  },
  storage: {
    from() {
      return {
        download: async () => ({ data: state.object, error: state.objectError }),
        remove: async (paths) => { state.removed.push(...paths); return { data: null, error: null }; }
      };
    }
  },
  rpc: async () => ({ data: state.published, error: state.publishError })
};

mock.module("@/lib/supabase/server", {
  namedExports: { createClient: async () => {
    if (!state.authConfigured) throw new Error("missing Supabase config");
    return client;
  } }
});
mock.module("@/lib/supabase/admin", {
  namedExports: { createAdminClient: () => admin }
});
mock.module("@/lib/processing/rate-limit", {
  namedExports: { consumeProcessingRateLimit: async () => state.rate }
});

const revisionsRoute = await import("../../app/api/editor/revisions/route.ts");
const downloadRoute = await import("../../app/api/editor/revisions/[id]/download/route.ts");

function request(url, method = "GET", body) {
  return new Request("http://localhost" + url, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
const context = (id = REVISION) => ({ params: Promise.resolve({ id }) });
function payload(overrides = {}) {
  return {
    documentId: DOCUMENT,
    revisionId: REVISION,
    parentRevisionId: null,
    storagePath: OWNER + "/" + DOCUMENT + "/editor/" + REVISION + "/saved.docx",
    name: "saved.docx",
    editorKind: "word",
    ...overrides
  };
}
function reset() {
  state.user = { id: OWNER };
  state.authError = null;
  state.authConfigured = true;
  state.rate = { allowed: true, retryAfterSeconds: 60 };
  state.document = { id: DOCUMENT, owner_id: OWNER, status: "uploaded", mime_type: WORD_MIME };
  state.revisions = [];
  state.object = new Blob(["not-a-zip"]);
  state.objectError = null;
  state.removed = [];
  state.published = [{ revision_id: REVISION, revision_version: 1 }];
  state.publishError = null;
  state.signed = { signedUrl: "https://private.example/revision" };
  state.signedCalls = 0;
}
beforeEach(reset);

test("revision history requires authentication and returns owner-scoped metadata without storage paths", async () => {
  state.user = null;
  let response = await revisionsRoute.GET(request("/api/editor/revisions?documentId=" + DOCUMENT));
  assert.equal(response.status, 401);

  state.user = { id: OWNER };
  state.revisions = [{ id: REVISION, version: 1, name: "saved.docx" }];
  response = await revisionsRoute.GET(request("/api/editor/revisions?documentId=" + DOCUMENT));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json();
  assert.equal(body.revisions.length, 1);
  assert.equal("storage_path" in body.revisions[0], false);
});

test("revision publication fails closed on rate-limit service errors and exhausted quotas", async () => {
  state.rate = { allowed: false, retryAfterSeconds: 19 };
  const response = await revisionsRoute.POST(request("/api/editor/revisions", "POST", payload()));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "19");
});

test("revision publication rejects anonymous, malformed and cross-owner source requests", async () => {
  state.user = null;
  let response = await revisionsRoute.POST(request("/api/editor/revisions", "POST", payload()));
  assert.equal(response.status, 401);

  state.user = { id: OWNER };
  response = await revisionsRoute.POST(request("/api/editor/revisions", "POST", payload({ storagePath: OWNER + "/other/editor/" + REVISION + "/saved.docx" })));
  assert.equal(response.status, 400);

  state.document = null;
  response = await revisionsRoute.POST(request("/api/editor/revisions", "POST", payload()));
  assert.equal(response.status, 404);
});

test("revision publication binds the editor kind to the source document format", async () => {
  state.document = { ...state.document, mime_type: "application/pdf" };
  const response = await revisionsRoute.POST(request("/api/editor/revisions", "POST", payload()));
  assert.equal(response.status, 409);
});

test("revision publication removes malformed uploaded objects and never publishes them", async () => {
  const response = await revisionsRoute.POST(request("/api/editor/revisions", "POST", payload()));
  assert.equal(response.status, 422);
  assert.deepEqual(state.removed, [payload().storagePath]);
});

test("revision downloads are owner-scoped and use short-lived private URLs", async () => {
  state.user = null;
  let response = await downloadRoute.GET(request("/api/editor/revisions/" + REVISION + "/download"), context());
  assert.equal(response.status, 401);
  assert.equal(state.signedCalls, 0);

  state.user = { id: OWNER };
  state.revisions = [{ storage_path: payload().storagePath, name: "saved.docx", mime_type: WORD_MIME }];
  response = await downloadRoute.GET(request("/api/editor/revisions/" + REVISION + "/download"), context());
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("location"), state.signed.signedUrl);
  assert.equal(state.signedCalls, 1);
});
