# PaperPilot 0.2.1 — processing pipeline license notes

This file records the newly introduced scanner component. Recheck exact image/package licences and notices before each release; this is not legal advice.

| Component | Use | License / source | Release action |
|---|---|---|---|
| ClamAV | Local malware scanning sidecar (clamav/clamav:1.5) | GNU GPL v2; official image documentation: https://docs.clamav.net/manual/Installing.html and https://hub.docker.com/r/clamav/clamav/ | Preserve GPL notices and source-offer obligations where applicable; review the image's third-party notices. No paid service or API is used. |
| LibreOffice | Existing isolated DOC/DOCX/PPT/PPTX conversion worker | LibreOffice is distributed under MPL 2.0 / LGPL family; verify notices for the exact Debian packages in the built image | Preserve notices and review distribution obligations for the exact build. |
| Node.js worker scanner client | ClamD INSTREAM TCP protocol client authored in this repository | Original project code; no new runtime package added | Keep tests and source with the repository. |

## Operational notes

- ClamAV is a signature-based scanner, not a guarantee that every malicious or novel document will be detected.
- The scanner must have current signature databases. A stale or unavailable scanner is a fail-closed error; the API must not mark a file clean.
- Official ClamAV Docker guidance documents TCP clamd on port 3310 and cautions that TCP is unencrypted; keep it on a private container network only.
- Official image guidance recommends 4 GiB memory for ClamAV. The Compose resource limit reflects that baseline; validate on the actual host before enabling the scanner.
- The ClamAV GPLv2 license and bundled third-party component notices require a distribution review before shipping the container image to customers.
