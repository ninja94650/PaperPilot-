# PaperPilot secure processing worker contract

The queue is PostgreSQL-backed. Supabase is the source of truth; workers poll the authenticated Next.js internal API. No Redis, paid queue, or service-role key is required inside the worker.

## User API

| Method | Route | Purpose |
|---|---|---|
| POST | /api/processing/jobs | Authenticated, idempotent job creation from a document already in the private library |
| GET | /api/processing/jobs/{id} | Owner-scoped status and progress-event history |
| POST | /api/processing/jobs/{id}/cancel | Immediate queued cancellation or cooperative running cancellation |
| GET | /api/processing/jobs/{id}/download | Short-lived signed download for a published immutable revision |

All user routes verify the Supabase user. The job and revision/event tables enforce owner-scoped RLS. Authenticated users have SELECT only; anon has no table privileges. Authenticated users cannot directly insert, update or delete queue rows; job mutations go through server routes.

## Internal worker API

Every internal route requires Authorization: Bearer DOCUMENT_WORKER_TOKEN. Compare tokens in constant time. Never send the Supabase service-role key to a worker.

| Method | Route | Purpose |
|---|---|---|
| POST | /api/internal/processing/claim-scan | Atomically claim one pending scan with a short lease and signed private input URL |
| POST | /api/internal/processing/scan-result | Record clean/rejected/failed verdict for the active scan lease |
| POST | /api/internal/processing/claim | Atomically claim a clean processing job and receive a signed input URL |
| POST | /api/internal/processing/heartbeat | Renew an active lease, update progress and expose cancellation requests |
| POST | /api/internal/processing/output-upload | Create a one-object signed upload URL for the active attempt |
| POST | /api/internal/processing/complete | Verify uploaded object metadata and invoke the atomic idempotent revision publisher |
| POST | /api/internal/processing/fail | Record a failure, schedule bounded retry or finalize the job |

## Worker behavior

- Scan pending uploads before processing. ClamAV unavailable, stale/unreadable signature data, or protocol errors must fail closed; never infer a clean verdict.
- Scan generated PDF output before publishing it.
- ClamAV runs as a separate container on the private Compose network at TCP port 3310. Do not publish this port: ClamD TCP is unencrypted.
- The worker claims jobs with Postgres row locking and a bounded lease. Expired leases are reclaimable; exhausted attempts fail closed.
- Default processing retry budget is 3 attempts with exponential backoff capped at 15 minutes. Scan attempts are capped at 3.
- Heartbeat renews the lease. Cancellation and lease loss abort active work; on Linux, LibreOffice runs in a detached process group so cancellation and timeout terminate its complete process tree, not only the launcher.
- Input URLs are short-lived signed URLs. Output keys are random, private, and attempt-specific. The original object is not overwritten.
- Output revisions are immutable and have per-document monotonically increasing version numbers. A row-locked Postgres RPC publishes the revision, finalizes the job and records the completion event in one transaction; retries return the same revision. Users receive signed download links only after success.
- Supported queued tool in this increment: DOC/DOCX/PPT/PPTX to PDF. Other tools remain browser-local or unavailable until their worker implementation is added.

## Office validation and limits

- Maximum input: 20 MiB; maximum output: 40 MiB.
- DOCX/PPTX are validated as ZIP packages before LibreOffice.
- OOXML bounds: 1,000 entries, 32 MiB per expanded entry, 128 MiB total expanded data, 200:1 maximum per-entry compression ratio.
- Reject ZIP64/multi-disk archives, encrypted entries, unsupported compression methods, duplicate paths, traversal/absolute paths, symbolic links, macro payloads and missing main document parts.
- Legacy DOC/PPT files receive OLE signature and size checks only; they do not receive OOXML ZIP-entry checks.
- LibreOffice runs as non-root in per-job temporary directories and has a 90-second default timeout.
- Temporary input/output/profile directories are deleted on completion or failure.

## Security boundaries and release gates

1. Keep the worker on a private network or IP allowlist behind HTTPS; add outbound egress restrictions at the host/platform layer.
2. Enforce host-level rate limits, concurrency quotas, CPU/memory/disk/PID limits and monitoring.
3. Keep the documents bucket private; never expose raw storage paths or permanent URLs.
4. The ClamAV signature database must be current; the scanner container has a persistent database volume and needs outbound access to its signature update mirrors. Restrict that egress to the required mirrors at the host firewall.
5. ClamAV is signature-based and does not guarantee detection of all malware. OOXML structural validation is not content disarm/reconstruction.
6. Add integration/E2E tests for upload → scan → convert → output scan → immutable revision → download; IDOR, retry, lease recovery, cancellation, cleanup and output tampering must be covered before public launch.
7. Do not enable public processing until the worker is deployed in a verified isolated environment and all external secrets, Auth URLs, SMTP, retention and operational controls are configured.
