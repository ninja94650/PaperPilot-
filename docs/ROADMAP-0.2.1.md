# PaperPilot 0.2.1 — Secure Processing Pipeline

Status: implementation in progress on feature/paperpilot-0.2-advanced-workspace. Database queue primitives, user APIs, worker APIs, ClamAV sidecar integration, and Office queue runner source have been added. This is not yet a production-ready deployment.

## Phase 1 — Durable job lifecycle

Implemented in source and linked Supabase schema:
- Job metadata now includes scan state, input/output object references, idempotency key, bounded attempts, availability time, processing lease, heartbeat, worker identity, cancellation request, progress and sanitized error code.
- Postgres claim functions use FOR UPDATE SKIP LOCKED and bounded leases.
- Expired processing leases are reclaimable; attempts are capped at 3.
- Retry backoff is bounded and cancellation is represented in the database.
- Owner-scoped job status, event history, idempotent creation and cancellation APIs are present.
- Authenticated users can select their own jobs but cannot directly insert/update/delete queue records.

Remaining:
- Verify all transitions with automated database integration tests, including simultaneous claims and cancellation/claim races.
- Add operator-visible DLQ/re-drive controls only after authorization and audit design.

## Phase 2 — Security inspection and quarantine gate

Implemented in source:
- New jobs enter scan_status=pending and cannot be claimed by the conversion worker until a trusted scanner reports clean.
- Separate scan claim leases and retry budget (3 attempts) are persisted.
- ClamAV INSTREAM client and isolated ClamAV Compose sidecar are added.
- The worker scans inputs and generated PDF outputs; scanner failures fail closed.
- Scan engine/signature version and verdict are recorded in job metadata/events.
- ClamAV TCP is internal-only; its database volume persists across restarts.

Remaining:
- Test against the official EICAR test file and real synthetic DOCX/PPTX fixtures in an isolated environment.
- Verify signature freshness and ClamAV startup/health behavior.
- Add CDR or an explicit decision to reject higher-risk content; antivirus scanning alone is not CDR.

## Phase 3 — Isolated Office worker and private storage

Implemented in source:
- Worker polls scan and processing queues through bearer-authenticated internal APIs. The legacy synchronous worker /convert endpoint now returns HTTP 410, and the Compose host binding is localhost-only so the old unscanned path cannot bypass the queue.
- Signed URLs are short-lived; the worker does not receive a Supabase service-role key.
- OOXML archive bounds and Office file signature checks run before LibreOffice.
- LibreOffice uses per-job random temporary paths/profile, non-root container, time/output limits and cleanup.
- Output PDF is scanned before upload.
- Outputs use random private storage keys and immutable document revision rows; originals are never overwritten.
- The old synchronous public proxy route has been retired in favor of the queue.

Remaining:
- Deploy only on a private/self-hosted environment with verified outbound egress restrictions, HTTPS API boundary, host firewall, rate limits and resource enforcement.
- Validate image build and end-to-end conversion for DOC, DOCX, PPT and PPTX.
- Verify storage cleanup on every failure and cancellation path.

## Phase 4 — Progress, cancellation and recovery

Implemented in source:
- Owner-scoped status/event endpoint and polling UI.
- Worker heartbeats extend leases and report progress.
- Queued cancellation is immediate; running cancellation is cooperative at worker stage boundaries.
- Worker failure API records retry/final failure; lease expiry permits recovery.
- Download endpoint only issues short-lived links for completed immutable revisions.

Remaining:
- ClamAV protocol tests cover clean, infected, protocol-error and invalid-size cases; worker HTTP regression tests confirm the retired synchronous endpoint returns HTTP 410. Add integration tests for worker crash, expired lease, retry delay, cancellation during LibreOffice, duplicate delivery and concurrent publication. ClamAV protocol unit tests now cover clean, infected, protocol-error and invalid-size outcomes.
- Add SSE/realtime only if polling becomes insufficient; status GET remains the reconnect/recovery source of truth.

## Phase 5 — Security, observability and release gates

Implemented in source:
- RLS and grants restrict direct queue mutations; new events/revisions have owner-scoped read policies.
- Internal APIs use constant-time bearer comparison.
- Output and input paths are private and not returned to the browser.
- Scanner and worker limits are documented; license note records ClamAV GPLv2.

Verified against the linked Supabase project:
- Atomic publish RPC passed a rollback-only SQL smoke test: two identical completion calls returned the same revision ID/version, job reached succeeded, and source document reached ready.
- RLS is enabled on jobs, revisions and events. Authenticated role has SELECT only on jobs and cannot INSERT/UPDATE/DELETE or execute the privileged publish RPC; service_role can execute the RPC.
- Supabase security advisor currently returns no findings. Performance advisor only reports unused-index notices on the low-volume/empty tables.

Remaining before public use:
- Automated cross-user/IDOR tests for every API route and storage object.
- Callback-forgery and malformed input regression tests.
- Host-level rate limiting, egress controls, metrics/alerts, log redaction, retention cleanup and backup/restore verification.
- Supabase security/performance advisor recheck and full GitHub CI pass.
- Vercel deployment API quota has previously been exhausted; do not bypass or pay. Use GitHub CI and wait for the free quota reset before requesting a preview deployment.
- Verify Supabase Auth redirects and SMTP.
- Review ClamAV GPLv2 distribution obligations and all container/package notices.

## Current supported server queue scope

Only Office-to-PDF is enabled in the queue submission API. PDF/image/OCR browser-local workflows remain local. Other server tools must not be enabled until their worker implementations and tests exist.

## Cost and deployment guardrails

- No paid queue, Redis, hosted malware scanning, commercial Office editor, paid API, new paid cloud resource or paid trial was introduced.
- Supabase Postgres is the durable queue source of truth.
- The Compose worker is a self-hosted reference. Do not deploy it on a billable host or exceed any existing free-tier allowance.
- Do not merge PR #3 or promote a preview to production without explicit user approval.
