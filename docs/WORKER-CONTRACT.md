# PaperPilot LibreOffice worker contract

The worker in worker/ implements this contract:

- GET /healthz
- POST /convert
- Authorization: Bearer <DOCUMENT_WORKER_TOKEN>
- Multipart file field named file
- Accept DOC, DOCX, PPT and PPTX only after checking extension and file signature
- Return PDF bytes beginning with %PDF-
- Return non-2xx for unsupported, corrupt, encrypted or timed-out inputs

Security requirements:
1. Run as a non-root UID in a disposable container.
2. Disable outbound network egress at the host or platform firewall.
3. Apply CPU, memory, process, disk and wall-clock limits.
4. Never interpolate the original filename into a shell command.
5. Generate server-side random working names; treat filenames as display metadata only.
6. Delete all job files on success, failure, timeout and cancellation.
7. Keep the shared bearer token in a secret manager; rotate it if exposed.
8. Do not log document contents or raw credentials.
9. Add platform-level rate limits, malware scanning, monitoring and a private network or IP allowlist before public production use.
