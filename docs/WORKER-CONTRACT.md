# PaperPilot LibreOffice worker contract

The worker in worker/ implements this contract:

- GET /healthz
- POST /convert
- Authorization: Bearer <DOCUMENT_WORKER_TOKEN>
- Multipart file field named file
- Accept DOC, DOCX, PPT and PPTX only after checking extension and file signature
- For DOCX/PPTX, validate ZIP central directory structure and bounded expansion metadata before invoking LibreOffice
- Return PDF bytes beginning with %PDF-
- Return non-2xx for unsupported, malformed, encrypted, or timed-out inputs

OOXML ZIP guardrails:
- Maximum 1,000 entries
- Maximum 32 MiB expanded bytes per entry
- Maximum 128 MiB aggregate expanded bytes
- Maximum 200:1 per-entry compression ratio
- Reject ZIP64 and multi-disk archives, encrypted entries, unsupported compression methods, duplicate names, absolute/traversal paths, symlinks, and macro payload entries
- Require [Content_Types].xml and the appropriate Word or PowerPoint main document part

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

The ZIP checks are structural/resource guards, not malware scanning or CDR. Legacy OLE DOC/PPT files do not receive OOXML ZIP-entry checks.
