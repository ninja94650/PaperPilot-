# PaperPilot 0.2.1 — processing pipeline license notes

This file records the newly introduced scanner component. Recheck exact image/package licences and notices before each release; this is not legal advice.

| Component | Use | License / source | Release action |
|---|---|---|---|
| ClamAV | Local malware scanning sidecar (clamav/clamav:1.5) | GNU GPL v2; official image documentation: https://docs.clamav.net/manual/Installing.html and https://hub.docker.com/r/clamav/clamav/ | Preserve GPL notices and source-offer obligations where applicable; review the image's third-party notices. No paid service or API is used. |
| LibreOffice | Existing isolated DOC/DOCX/PPT/PPTX conversion worker | LibreOffice is distributed under MPL 2.0 / LGPL family; verify notices for the exact Debian packages in the built image | Preserve notices and review distribution obligations for the exact build. |
| Node.js worker scanner client | ClamD INSTREAM TCP protocol client authored in this repository | Original project code; no new runtime package added | Keep tests and source with the repository. |\n| Prometheus | Self-hosted worker metrics and alert-rule evaluation (`prom/prometheus:v3.2.1`) | Apache License 2.0; upstream project: https://github.com/prometheus/prometheus | Preserve Apache 2.0 license and notices for the exact image; metrics stay on the private Compose network and UI binds to loopback. |
| @p10node/office-engine | Browser-local Word/Presentation editor pilot, exact upstream release 0.18.0 | MIT; https://github.com/p10node/office-engine/blob/main/LICENSE | Preserve MIT copyright and permission notice. Exact release tarball pinned by SHA-256 in package-lock.json. Pilot only; run PaperPilot compatibility and security tests before production use. |
| Vite (test-only) | Isolated browser fixture server for Office editor E2E tests, pinned 8.3.5 | MIT; https://github.com/vitejs/vite/blob/main/LICENSE | Installed only in the CI runner temp directory; not a production dependency. |
| Playwright Core (test-only) | Chromium automation for real DOCX/PPTX edit-save-reopen tests, pinned 1.57.0 | Apache-2.0; https://github.com/microsoft/playwright/blob/main/LICENSE | Installed only in the CI runner temp directory; Chromium browser binaries are CI-only. |
| python-docx / python-pptx (test-only) | Synthetic DOCX/PPTX fixture generation, pinned 1.1.2 / 1.0.2 | MIT / MIT; https://github.com/python-openxml/python-docx/blob/master/LICENSE; https://github.com/scanny/python-pptx/blob/master/LICENSE | Test-only Python tooling; no user document content is uploaded to third-party services. |

## Operational notes

- ClamAV is a signature-based scanner, not a guarantee that every malicious or novel document will be detected.
- The scanner must have current signature databases. A stale or unavailable scanner is a fail-closed error; the API must not mark a file clean.
- Official ClamAV Docker guidance documents TCP clamd on port 3310 and cautions that TCP is unencrypted; keep it on a private container network only.
- Official image guidance recommends 4 GiB memory for ClamAV. The Compose resource limit reflects that baseline; validate on the actual host before enabling the scanner.\n- Prometheus is self-hosted and uses no paid monitoring service. Its 15-day/1-GiB retention bounds local metrics storage; Alertmanager delivery is not configured yet.
- The ClamAV GPLv2 license and bundled third-party component notices require a distribution review before shipping the container image to customers.
