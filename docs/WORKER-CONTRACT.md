# PaperPilot LibreOffice worker contract

The worker is a separate service, not a Vercel function. It must implement:

- \`POST /convert\`
- \`Authorization: Bearer <DOCUMENT_WORKER_TOKEN>\`
- Multipart file field named \`file\`
- Accept only DOC, DOCX, PPT, PPTX after checking both extension and file signature
- Return \`application/pdf\` bytes beginning with \`%PDF-\`
- Return a non-2xx response for unsupported, corrupt, encrypted, or timed-out inputs

Security requirements:

1. Run as a non-root UID in a disposable container.
2. Disable network egress and mount only a per-job temporary directory.
3. Apply CPU, memory, process, disk, and wall-clock limits.
4. Never interpolate the original filename into a shell command.
5. Generate server-side random working names; treat filenames as display metadata only.
6. Delete all job files on success, failure, timeout, and cancellation.
7. Keep the shared bearer token in a secret manager; rotate it if exposed.
8. Do not log document contents or raw credentials.
9. Add rate limits, concurrency caps, malware scanning, and queueing before public production use.
