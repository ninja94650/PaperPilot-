# PaperPilot isolated Office worker and security scanner

The worker has two queue stages: ClamAV inspection, then LibreOffice conversion. It polls PaperPilot's authenticated internal API; it does not need direct database credentials.

## Local setup

Requirements: Docker Compose and enough host memory for the scanner (ClamAV's official Docker guidance recommends 4 GiB for the scanner container).

Set these variables in your shell or a local .env file in this directory:

- DOCUMENT_WORKER_TOKEN — random secret, at least 32 characters; must match the server-only Vercel variable
- PAPERPILOT_API_URL — PaperPilot application base URL, without a trailing slash
- PAPERPILOT_WORKER_ID — stable unique worker label, for example office-worker-1

Then run:

```bash
docker compose up --build
```

The ClamAV service is reachable only on the Compose network at clamav:3310. Do not publish that port; clamd's TCP protocol is unencrypted. The ClamAV database is persisted in the clamav-db volume and is updated by the official image.

## Queue flow

1. An authenticated user uploads to the private documents bucket and submits an idempotent Office conversion job.
2. The API stores the job as queued with scan_status=pending. No worker may process it yet.
3. The scanner claims a short lease, downloads a short-lived signed input URL, and scans it through ClamAV INSTREAM.
4. A clean result changes scan_status to clean. Rejected or repeatedly unavailable scans fail closed.
5. The converter claims only clean jobs, renews its processing lease, validates the Office signature/OOXML archive, and converts in a disposable LibreOffice profile.
6. The generated PDF is scanned again. Only a clean PDF is uploaded to a random private output key and published as an immutable document revision.
7. Users poll the owner-scoped status endpoint and obtain a short-lived signed download URL only after success.

The worker uses the same bearer token for its internal API calls. Keep it secret and rotate it if exposed. Do not place the Supabase service-role key in the worker or browser.

## Limits and validation

- Input maximum: 20 MiB; output maximum: 40 MiB. The private documents bucket is configured for 40 MiB objects to allow generated PDFs; the job API and worker independently enforce the smaller input cap.
- Supabase signed upload URLs are valid for 2 hours and single-use for the exact object path; each processing attempt uses a distinct immutable output key.
- OOXML archive bounds: 1,000 entries, 32 MiB per expanded entry, 128 MiB total expanded data, and 200:1 maximum per-entry compression ratio.
- Reject ZIP64/multi-disk archives, encrypted entries, unsupported compression methods, duplicate or traversal paths, symbolic links, macro payloads and missing main document parts.
- Legacy DOC/PPT files receive OLE signature and size checks; they do not receive the OOXML ZIP checks.
- LibreOffice runs as non-root with per-job random input/output/profile directories and a 90-second default timeout.
- ClamAV errors, unavailable signatures and malformed responses fail closed. A scanner verdict is not a guarantee against all malware.

## Tests

Run:

```bash
npm ci --prefix worker
npm test --prefix worker
```

Tests include Office signature/archive validation and a fake ClamD TCP server for clean, infected and invalid-input cases.

## Deployment gates

- Keep the worker on a private network or IP allowlist, behind HTTPS at the API boundary, with outbound egress restrictions.
- The Compose file is a local/self-hosted reference, not a Vercel deployment. Do not expose port 8080 publicly without a hardened reverse proxy.
- Add host-level rate limiting, alerting, resource monitoring, signature freshness checks and incident response before public launch.
- ClamAV is GPLv2; review COPYING and third-party notices before redistributing the image. See docs/LICENSING-0.2.1.md.
- The OOXML validator is a structural/resource gate, not CDR. The worker is not production-approved until security review, sandbox verification and end-to-end tests are complete.
