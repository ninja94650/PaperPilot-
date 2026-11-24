# PaperPilot 0.2 integrations

## Supabase Auth and cloud library

The existing Supabase project is in Mumbai (ap-south-1). The Vercel project already has NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY configured for production, preview and development.

The existing migration 20261124000000_paperpilot_workspace_foundation creates:
- profiles, documents and processing_jobs with row-level security
- A private Storage bucket named documents
- Per-user row and storage policies

The account page uses this existing schema. Cloud files are stored under <auth-user-id>/<random-id>/<safe-file-name>; metadata is stored in public.documents. Signed download links expire after 60 seconds. Uploads are limited to 20 MB and show real upload progress.

For production email confirmation and password recovery, configure the Supabase Auth Site URL and redirect allowlist with:
- https://paperpilot-ninja94650-5268.vercel.app/auth/callback
- Your Vercel preview callback URL ending in /auth/callback
- http://localhost:3000/auth/callback for local development

Configure SMTP before relying on production email delivery.

## Secure asynchronous processing worker

PaperPilot 0.2.1 adds a Postgres-backed job queue and a self-hosted worker reference in worker/. The synchronous web proxy was retired; Office conversion now uses the authenticated queue APIs.

The flow is:
1. A signed-in user uploads an Office document to the private documents bucket.
2. The server verifies ownership and creates an idempotent processing job in queued / scan_status=pending.
3. A separate scan lease is claimed through the internal worker API. ClamAV scans the input; only a clean verdict permits conversion.
4. The conversion worker claims a clean job, downloads a short-lived signed URL, validates the Office extension/signature and OOXML archive bounds, and runs LibreOffice in a per-job temporary profile.
5. The output PDF is scanned again. A clean result is uploaded directly to private Supabase Storage through a one-object signed upload URL scoped to the active attempt, then verified and published as an immutable document revision. Large PDF bytes do not pass through Vercel.
6. Users can poll owner-scoped status/events, request cancellation, and download a completed revision using a 60-second signed URL.

The worker has no Supabase service-role key. It authenticates to internal endpoints with DOCUMENT_WORKER_TOKEN. The web deployment needs these server-only variables:
- SUPABASE_SERVICE_ROLE_KEY — required for server-controlled queue and private output publication; never expose it with NEXT_PUBLIC_
- DOCUMENT_WORKER_TOKEN — random secret of at least 32 characters, shared with the worker
- NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — already used by the authenticated app

The worker Compose environment also requires:
- PAPERPILOT_API_URL — PaperPilot application base URL without a trailing slash
- PAPERPILOT_WORKER_ID — unique worker label
- DOCUMENT_WORKER_TOKEN — same secret as the web deployment

ClamAV runs as a separate container on the private Compose network at port 3310. Do not publish this port: ClamD TCP is unencrypted. ClamAV needs persistent signature storage and outbound access to its signature mirrors; restrict this egress at the host firewall. Its official image guidance recommends 4 GiB memory for the scanner container.

Office validation bounds:
- Input maximum 20 MiB; output maximum 40 MiB
- 1,000 OOXML entries maximum
- 32 MiB expanded size per entry
- 128 MiB aggregate expanded size
- 200:1 maximum per-entry compression ratio
- ZIP64, multi-disk, encrypted, duplicate, traversal, symlink and macro payload entries are rejected

Legacy DOC/PPT inputs receive OLE signature and size checks only. Structural checks are not malware scanning or CDR. ClamAV is signature-based and cannot guarantee detection of every threat.

Do not expose processing publicly until the worker is deployed on a private/self-hosted network with HTTPS at the API boundary, host-level egress restrictions, rate limiting, monitoring, verified resource limits, current signatures, and cross-user/cancellation/cleanup E2E tests. See docs/ROADMAP-0.2.1.md and docs/WORKER-CONTRACT.md.

## ONLYOFFICE Docs

The web integration includes:
- Authenticated document configuration endpoint
- Short-lived signed Storage URL for the source file
- HS256-signed editor configuration
- Callback JWT verification
- Callback document-key and server-host validation
- Bounded save download and Office file signature validation
- Server-side Storage update using a service-role key

Deploy ONLYOFFICE Docs separately and set:
- ONLYOFFICE_DOCUMENT_SERVER_URL
- ONLYOFFICE_JWT_SECRET (at least 32 characters and identical to the Docs server secret)
- SUPABASE_SERVICE_ROLE_KEY (server-only; never add a NEXT_PUBLIC_ prefix)

Do not enable production editing until the Docs server is reachable by the browser and callback service, the callback URL is reachable from the Docs server, and an authenticated edit-save-reopen test passes.

## Browser-side tools and limits

- PDF.js viewer, thumbnails, page selection, drag reorder, move controls and delete run locally.
- PDF compression rasterizes pages at the chosen JPEG quality. It can flatten text, links, forms and vector content; compare output size before using it.
- OCR runs in the browser and exports a text transcript. It does not yet add a searchable text layer to the original PDF.
- Image-to-PDF and PDF-to-PNG conversion run locally.
- Browser PDF rendering is capped at 150 pages; OCR and page-image export are capped at 100 pages.
- DOC/DOCX/PPT/PPTX conversion requires the isolated LibreOffice worker.
- Cloud uploads and document history use the existing Supabase project and migration.
