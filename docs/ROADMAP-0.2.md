# PaperPilot 0.2 — Advanced Document Workspace

Status: planned. This document defines the implementation sequence; listed capabilities are not yet claimed as shipped.

## Release goals

Evolve the current browser-based PDF foundation into a reliable document workspace while preserving the existing production experience. Every capability must have acceptance tests, explicit limits, and safe failure behavior.

## Delivery sequence

### 0.2.0 — Foundation and dependency hygiene
- Add and commit the package manager lockfile; standardize the Node.js version used locally and in CI/Vercel.
- Run a full dependency audit, update vulnerable direct/transitive packages, and document any accepted residual advisories.
- Add CI checks for install from lockfile, typecheck, production build, and unit tests.
- Add regression coverage for existing PDF merge, extraction, rotation, signature, and multi-file import flows.
- Keep the production deployment stable; use preview deployments for feature work.

**Exit criteria:** clean reproducible install; no unreviewed high/critical dependency advisories; existing PDF workflows pass automated tests.

### 0.2.1 — PDF workspace
- Introduce PDF.js for rendering and text/viewport access, with a pinned compatible version and worker configuration.
- Add page thumbnails, page selection, drag-to-reorder, and delete/undo.
- Keep editing operations non-destructive until the user confirms export; preserve page order and document integrity.
- Add large-file handling, loading/error states, and accessibility for keyboard users.

**Exit criteria:** viewer renders multi-page PDFs; reorder/delete/undo/export preserve expected page content and order.

### 0.2.2 — Real PDF compression
- Implement a measurable compression pipeline with presets (light, balanced, strong) and a custom quality option where supported.
- Explain that image downsampling/re-encoding can reduce visual quality; preserve vector/text content where possible.
- Report input/output size and percentage saved; never claim savings when output is larger.
- Test text-heavy, image-heavy, scanned, mixed, encrypted, and malformed PDFs.

**Exit criteria:** deterministic tests validate output readability, page count, size reporting, and graceful unsupported-file handling.

### 0.2.3 — Office conversion workers
- Add isolated LibreOffice workers for DOCX/PPTX to PDF and supported reverse conversions.
- Run workers in non-root containers with CPU, memory, time, disk, and network limits.
- Validate MIME type and file signatures; randomize temporary paths; enforce upload and output limits.
- Clean temporary files on success, failure, timeout, and cancellation.
- Queue jobs and expose truthful progress states (queued, processing, completed, failed).

**Exit criteria:** representative DOCX/PPTX fixtures convert correctly; worker isolation and cleanup tests pass.

### 0.2.4 — ONLYOFFICE editing
- Integrate ONLYOFFICE Docs through its documented editor configuration and callback flow.
- Keep document storage and editor callbacks behind authenticated server endpoints.
- Use short-lived, document-scoped access tokens; validate callback signatures/tokens and permissions.
- Define supported formats, licensing, deployment requirements, and operational costs before enabling production.

**Exit criteria:** authenticated user can open, edit, save, and reopen an authorized test document; cross-user access is denied.

### 0.2.5 — Secure cloud processing
- Add private object storage with randomized object keys, encryption in transit/at rest, signed short-lived upload/download URLs, and lifecycle cleanup.
- Add a job queue and worker status API; do not expose internal storage paths.
- Enforce file size, page count, format, rate, concurrency, and retention limits.
- Add malware scanning where operationally available and reject malformed or mismatched file types.
- Ensure logs contain job identifiers and safe metadata, not document contents or secrets.

**Exit criteria:** upload/process/download flow works end-to-end; authorization, expiry, cleanup, and abuse-limit tests pass.

### 0.2.6 — Accounts and document history
- Add authentication, verified sessions, account recovery, and optional OAuth only after the security model is reviewed.
- Enforce ownership checks on every document, job, and download endpoint.
- Add document history with timestamps, processing status, retention controls, and user-initiated deletion.
- Provide account data export and deletion workflows; never make documents public by default.

**Exit criteria:** multi-user isolation tests prove one user cannot list, read, edit, or download another user's files.

## Architecture guardrails

- Keep browser-local processing for suitable operations; route CPU/memory-heavy conversion through isolated workers.
- Treat every uploaded document as untrusted input.
- Separate web/API, queue, conversion workers, object storage, and relational metadata.
- Use least-privilege service credentials, secret management, structured audit events, and explicit retention.
- Never trust a client-supplied filename, MIME type, document ID, callback URL, or processing status.
- Add observability for job latency, failures, queue depth, worker resource use, and storage lifecycle.
- Use feature flags and preview deployments for staged rollout.

## Required test matrix

- Unit: page operations, compression settings, validation, authorization policy.
- Integration: upload -> queue -> worker -> storage -> download.
- Security: IDOR/cross-user access, expired tokens, path traversal, oversized files, malformed inputs, callback forgery, rate limits.
- Regression: merge, extraction, rotation, signature, multiple imports during editing.
- E2E: keyboard navigation, progress states, cancellation, retry, and mobile/responsive workspace.

## Explicitly not assumed complete

PDF.js rendering, real compression, LibreOffice conversion, ONLYOFFICE editing, cloud storage, background processing, accounts, and document history are planned work until implemented and verified.
