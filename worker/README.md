# PaperPilot isolated Office worker and security scanner

The worker has two queue stages: ClamAV inspection, then LibreOffice conversion. It polls PaperPilot's authenticated internal API; it does not need direct database credentials.

## Local setup

Requirements: Docker Compose v2.33.1 or newer (for explicit gateway priority) and enough host memory for the scanner (ClamAV's official Docker guidance recommends 4 GiB for the scanner container).

Copy `.env.example` to `.env` and set:

- DOCUMENT_WORKER_TOKEN — random secret, at least 32 characters; must match the server-only Vercel variable
- PAPERPILOT_API_URL — PaperPilot application base URL, without a trailing slash
- PAPERPILOT_WORKER_ID — stable unique worker label, for example office-worker-1
- PAPERPILOT_API_HOST and SUPABASE_HOST — exact DNS names used by the host egress allowlist
- CLAMAV_UPDATE_HOST — ClamAV signature update hostname
- the static subnet/IP values, after confirming the ranges do not conflict with the host's Docker networks

Then run:

```bash
docker compose up --build
```

The converter connects to ClamAV through its private-network address on TCP 3310. Do not publish that port; clamd's TCP protocol is unencrypted. ClamAV also has a separate egress attachment for signature updates; the host egress policy limits that address to the configured update host. The converter has its own egress attachment for HTTPS calls to PaperPilot and Supabase. Prometheus is attached only to the internal network. The ClamAV database is persisted in the clamav-db volume and is updated by the official image.

## Queue flow

1. An authenticated user uploads to the private documents bucket and submits an idempotent Office conversion job.
2. The API stores the job as queued with scan_status=pending. No worker may process it yet.
3. The scanner claims a short lease, downloads a short-lived signed input URL, and scans it through ClamAV INSTREAM.
4. A clean result changes scan_status to clean. Rejected or repeatedly unavailable scans fail closed.
5. The converter claims only clean jobs, renews its processing lease, validates the Office signature/OOXML archive, and converts in a disposable LibreOffice profile.
6. The generated PDF is scanned again. Cancellation or a lost worker lease aborts the LibreOffice child process; atomic publication rechecks cancellation and lease state. Only a clean PDF is uploaded to a random private output key and published as an immutable document revision.
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

## Monitoring and health

- `/healthz` is a liveness endpoint.
- `/readyz` checks required worker configuration and that ClamAV responds to a bounded version probe. It does not prove the remote PaperPilot API, Supabase database or Storage are reachable.
- `/metrics` exports low-cardinality Prometheus counters and duration histograms. It deliberately omits user IDs, job IDs, file names, signed URLs and tokens.
- Prometheus scrapes the worker every 15 seconds. Its UI is bound to `127.0.0.1:9090`; the worker's `/metrics` endpoint is not host-published. Metrics retention is capped at 15 days and 1 GiB. `alerts.yml` includes worker scrape, stale polling, repeated job failure, scanner failure and output cleanup rules. No Alertmanager receiver is configured, so rules can become firing alerts in Prometheus but will not notify an operator until a delivery target is explicitly configured.
- The worker's health check is local to the container. A healthy container is not proof of production SLOs, backups, alert delivery or remote API reachability.

Open the Prometheus UI locally at `http://127.0.0.1:9090`. For a remote host, use an SSH tunnel rather than publishing port 9090 publicly.

## Host egress policy

The Compose file separates the worker's internal scanner/monitoring network from its HTTPS egress network. It sets the egress network as the explicit default gateway (Compose v2.33.1+). Compose alone does not restrict the egress network. A host nftables policy is provided:

```bash
cd worker
set -a
source .env
set +a
./egress-firewall.sh --dry-run
sudo env \
  PAPERPILOT_API_HOST="$PAPERPILOT_API_HOST" \
  SUPABASE_HOST="$SUPABASE_HOST" \
  CLAMAV_UPDATE_HOST="$CLAMAV_UPDATE_HOST" \
  PAPERPILOT_WORKER_EGRESS_IP="$PAPERPILOT_WORKER_EGRESS_IP" \
  PAPERPILOT_CLAMAV_EGRESS_IP="$PAPERPILOT_CLAMAV_EGRESS_IP" \
  PAPERPILOT_EGRESS_GATEWAY="$PAPERPILOT_EGRESS_GATEWAY" \
  ./egress-firewall.sh --apply
```

The script is dry-run by default. It permits worker egress only to the resolved IPv4 addresses for the configured PaperPilot API and Supabase hosts on TCP 443, and ClamAV egress only to the configured update host on TCP 443. It blocks those containers from reaching the Docker host gateway and drops other forwarded IPv4 traffic from their egress IPs.

Important limitations:
- This is an IP-based allowlist, not TLS SNI/FQDN filtering. Shared CDN addresses may serve other hostnames; use a dedicated, authenticated egress proxy with strict hostname policy if exact destination-host enforcement is required.
- DNS answers can change. Re-run the script after DNS changes and verify the new rules before restarting processing.
- The Compose networks default to IPv4. Confirm Docker has not enabled IPv6 routing for these networks; otherwise add and verify an equivalent IPv6 deny policy.
- The script has not been applied to a production host in this repository workflow. Host firewall state and real allowed/blocked connectivity must be checked on the actual worker host before production approval.

## Tests

Run:

```bash
npm ci --prefix worker
npm test --prefix worker
```

Tests include Office signature/archive validation, fake and live ClamAV checks, HTTP regressions, queue-to-storage orchestration using real LibreOffice with deterministic local API/storage fixtures, metrics, health endpoints, Compose isolation assertions, and firewall script syntax checks. The queue-to-storage harness does not connect to the live Supabase project.

## Deployment gates

- The Compose file is a self-hosted reference, not a Vercel deployment. Port 8080 binds to 127.0.0.1 only; port 9090 is also loopback-only. Do not expose either directly to the internet. If remote worker access is needed, use a hardened HTTPS reverse proxy and explicit ingress allowlist.
- Apply and verify the host nftables egress policy on the actual Docker host. Confirm only the configured API/Supabase and ClamAV update destinations are reachable; test that arbitrary HTTPS, HTTP, SMTP, metadata endpoints and host-gateway services are blocked.
- Verify Prometheus targets are up, inspect the metrics endpoint from the private network, and configure alert delivery before public launch. Alertmanager receiver/delivery, host resource monitoring, ClamAV signature freshness alerts, backup/restore drills and SLOs remain outstanding.
- The legacy synchronous /convert endpoint returns 410 so it cannot bypass the malware-scan queue. The queue runner processes one job at a time per container.
- ClamAV is GPLv2; review COPYING and third-party notices before redistributing the image. See docs/LICENSING-0.2.1.md.
- The OOXML validator is a structural/resource gate, not CDR. The worker is not production-approved until security review, sandbox verification and end-to-end tests are complete.
