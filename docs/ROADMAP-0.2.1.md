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
- Processing API calls use a database-backed per-user fixed-window quota: job creation 10/minute, status 60/minute, cancellation 10/minute and downloads 10/minute. The browser cannot choose limits; a rate-limit backend error fails closed.

Remaining:
- Disposable PostgreSQL CI regression now verifies owner A/B visibility for jobs, events and revisions, plus expired processing lease reclamation. It also verifies the first 10 job-create requests are allowed, the 11th is denied, and a second user receives an independent quota. Simultaneous claim races and cancellation/claim races still need dedicated concurrent tests.
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
- Live ClamAV CI job passed against the official EICAR test string and a harmless synthetic PDF. Freshclam updated the daily database in the isolated test container; the scanner reached healthy state before scanning.
- Continue monitoring signature freshness and scanner startup/health in a deployed environment.
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
- CI run #175 built the actual worker Docker image, converted DOC/DOCX/PPT/PPTX fixtures to PDFs, and passed a queue-to-storage orchestration test using real LibreOffice and a deterministic local API/storage fixture. The test verified clean input scan, conversion, output scan, private-object PUT, PDF signature/size verification and revision-publication ordering. It does not connect to live Supabase Storage or the production API.
- Worker Docker image now selects the headless SVP VCL plugin; the conversion test caught and fixed an X11 display dependency.
- Verify storage cleanup on every failure and cancellation path.

## Phase 4 — Progress, cancellation and recovery

Implemented in source:
- Owner-scoped status/event endpoint and polling UI.
- Worker heartbeats extend leases and report progress.
- Queued cancellation is immediate; running cancellation is cooperative at worker stage boundaries.
- Worker now asks the internal API to remove prior-attempt output objects after a retry claim and periodically sweeps private outputs belonging to queued, failed, cancelled or long-expired jobs. Cleanup validates the exact owner/job/attempt path, preserves active current-attempt outputs, and applies a five-minute grace to expired leases. The worker logs aggregate cleanup counts without exposing storage paths. Claim/failure handlers now retain the DB path reference if object deletion fails, allowing the periodic sweeper to retry instead of losing track of an orphan.
- Worker failure API records retry/final failure; lease expiry permits recovery.
- Download endpoint only issues short-lived links for completed immutable revisions.

Remaining:
- CI run #138 passed Linux process-group cancellation integration: cancelling the detached worker also terminated a spawned descendant. The test is Linux-only; Windows process-tree termination remains a separate platform consideration.
- Live ClamAV EICAR detection and clean-PDF scan passed in CI run #138; all 26 worker tests passed with zero skips.
- Disposable PostgreSQL CI fixture passed expired processing-lease recovery. Worker crash, retry delay, duplicate delivery, Storage deletion failure injection and concurrent publication still need dedicated end-to-end tests. The new local queue-to-storage harness covers the successful path only.
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
- Live privilege verification returned zero anon grants and zero authenticated write grants across processing jobs, events and revisions.
- Live schema inspection confirmed processing event IDs use the expected sequence and the queue-claim RPC signature matches the regression fixture.

Remaining before public use:
- Rollback-only SQL regression fixture `supabase/tests/processing_pipeline_rls_and_recovery.sql` passed in CI against an ephemeral PostgreSQL 17 service with a Supabase-compatible bootstrap schema. It covers owner A/B visibility for jobs, events, revisions and private storage, expired processing-lease reclamation and rate limits. This is not a live Supabase local-stack test; do not run the rollback-only fixture against production.
- Route-level HTTP request tests now cover job creation, status, cancellation, download, cross-tenant ID hiding, signed-link protection, rate-limit behavior and worker bearer-token rejection. GitHub Actions run #175 passed the complete HTTP authorization suite.
- Callback-forgery and malformed input regression tests remain.
- Added 7 output-cleanup classifier tests for current attempt preservation, retry cleanup, terminal jobs, lease grace, foreign paths and future-attempt path rejection. Root security suite now has 11 passing tests.
- Opt-in live ClamAV EICAR and clean-PDF integration fixtures in `worker/clamav.integration.test.mjs` passed in CI run #175 against the official ClamAV container.
- GitHub Actions run #175 passed all four CI jobs on the feature head, including route-level HTTP authorization, worker conversion queue-to-storage orchestration, live ClamAV and disposable PostgreSQL RLS/rate-limit regression. GitHub Actions run #126 passed on feature head `7562c9f0195b45eccfe846d18d26e6293c8b6416`: 24 worker tests passed, 2 opt-in live ClamAV tests skipped, both dependency audits reported zero vulnerabilities, TypeScript typecheck passed and Next.js production build passed.
- Added low-cardinality Prometheus metrics for scan/job results, durations, cleanup outcomes, queue poll errors and last-success timestamps. Added /readyz and /metrics endpoints, a private-network Prometheus service with 15-day/1-GiB retention, loopback-only UI binding, and health/metrics tests. CI verifies the application metrics and static Compose controls; it does not prove a deployed Prometheus scrape or alert delivery.
- Compose now separates an internal worker/ClamAV/Prometheus network from the worker/ClamAV HTTPS egress network. Added a dry-run-first nftables host policy script to restrict worker egress to resolved PaperPilot API/Supabase IPv4 destinations and ClamAV egress to its update host.
- Production network/monitoring verification remains open: the host firewall script has not been applied to a real worker host; Docker network routing, IPv6, allowed/blocked egress, Prometheus scrape health, alert delivery, log redaction/retention, host resource monitoring, backups/restore and SLOs must be verified on the deployment host.
- Supabase security/performance advisor recheck and full GitHub CI pass on any subsequent code changes.
- Vercel deployment API quota has previously been exhausted; do not bypass or pay. Wait for the free quota reset before requesting a preview deployment.
- Verify Supabase Auth redirects and SMTP.
- Review ClamAV GPLv2 distribution obligations and all container/package notices.

## Current supported server queue scope

Only Office-to-PDF is enabled in the queue submission API. PDF/image/OCR browser-local workflows remain local. Other server tools must not be enabled until their worker implementations and tests exist.

## Cost and deployment guardrails

- No paid queue, Redis, hosted malware scanning, commercial Office editor, paid API, new paid cloud resource or paid trial was introduced.
- Supabase Postgres is the durable queue source of truth.
- The Compose worker is a self-hosted reference. Do not deploy it on a billable host or exceed any existing free-tier allowance.
- Do not merge PR #3 or promote a preview to production without explicit user approval.
