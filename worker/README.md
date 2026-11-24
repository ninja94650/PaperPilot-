# PaperPilot LibreOffice worker

This is the isolated DOC/DOCX/PPT/PPTX-to-PDF service used by the authenticated Next.js API proxy.

## Run locally

Create a long random token (at least 32 characters), then:

\`\`\`bash
cd worker
export DOCUMENT_WORKER_TOKEN="replace-with-a-long-random-secret"
docker compose up --build
\`\`\`

Health check: \`http://localhost:8080/healthz\`.

The worker accepts \`POST /convert\` with multipart field \`file\` and an Authorization bearer token. It returns PDF bytes.

## Connect to PaperPilot

Set these server-only Vercel environment variables:

- \`DOCUMENT_WORKER_URL\` — the public HTTPS base URL of this service
- \`DOCUMENT_WORKER_TOKEN\` — the exact same secret as the worker

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
