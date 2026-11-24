# PaperPilot LibreOffice worker

This is the isolated DOC/DOCX/PPT/PPTX-to-PDF service used by the authenticated Next.js API proxy.

## Run locally

Create a long random token (at least 32 characters), then:

```bash
cd worker
export DOCUMENT_WORKER_TOKEN="replace-with-a-long-random-secret"
docker compose up --build
```

Health check: `http://localhost:8080/healthz`.

The worker accepts `POST /convert` with multipart field `file` and an Authorization bearer token. It returns PDF bytes.

## Input validation

- All uploads are limited to 20 MB.
- DOCX/PPTX ZIP packages are checked before LibreOffice sees them.
- The validator rejects malformed/truncated directory records, ZIP64 and multi-disk packages, encrypted entries, unsupported compression methods, duplicate or traversal paths, symbolic links, macro payloads, missing Office document parts, excessive entry counts, oversized expanded entries, excessive total expanded size, and extreme compression ratios.
- Current OOXML bounds: 1,000 entries, 32 MiB per expanded entry, 128 MiB total expanded data and a 200:1 maximum per-entry compression ratio.
- Legacy DOC/PPT files are checked for their OLE signature and upload size, but do not receive the OOXML ZIP-entry checks.

These checks are a pre-parser resource and structure gate, not malware scanning, content disarm/reconstruction, or proof that a document is safe. Keep conversion disabled for public users until malware/CDR controls and the production isolation requirements below are met.

## Connect to PaperPilot

Set these server-only Vercel environment variables:

- `DOCUMENT_WORKER_URL` — the public HTTPS base URL of this service
- `DOCUMENT_WORKER_TOKEN` — the exact same secret as the worker

The PaperPilot proxy requires a signed-in user and limits incoming files to 20 MB.

## Production deployment requirements

- Use a private network or IP allowlist so only the PaperPilot API can reach the worker.
- Enforce outbound network restrictions at the host or platform firewall.
- Put an HTTPS reverse proxy in front of the worker; do not expose port 8080 publicly without it.
- Keep the worker non-root, read-only, resource-limited and ephemeral as configured in Compose.
- Add platform-level request rate limits and monitoring before public launch.
- Rotate the shared bearer token if it is exposed.
- LibreOffice is a complex file parser; keep the container patched and never mount user data or host directories into it.

The Compose limits are a baseline, not a substitute for host-level egress restrictions, malware scanning, queueing and observability.
