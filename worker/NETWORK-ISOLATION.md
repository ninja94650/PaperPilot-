# PaperPilot worker network and monitoring verification

This is the deployment-host runbook for the self-hosted Office worker. CI can validate Compose syntax, application metrics, alert-rule syntax and the worker conversion path, but only the actual Docker host can prove firewall behavior and live Prometheus scraping.

## Network layout

| Network | Members | Intended access |
|---|---|---|
| `worker-private` (internal) | Converter, ClamAV, Prometheus | Scanner TCP 3310 and metrics scrape only; no default internet route |
| `worker-egress` (bridge) | Converter, ClamAV | Converter: PaperPilot API + Supabase HTTPS; ClamAV: signature update HTTPS |

The converter connects to the fixed ClamAV private-network address, not the scanner's egress address. Compose sets `gw_priority: 1` on the egress network and `0` on the internal network. Prometheus is not attached to the egress network.

Host-published ports:
- `127.0.0.1:8080`: worker liveness/readiness only.
- `127.0.0.1:9090`: Prometheus UI.
- ClamAV TCP 3310 and worker metrics TCP path 8080 are not published to non-loopback host interfaces.

The default Docker subnets are `172.30.42.0/24` (egress) and `172.30.43.0/24` (private). Confirm neither conflicts with existing LAN, VPN, Docker or Kubernetes routes before startup. Change the subnet and all static IP/gateway values together if necessary.

## Apply order

1. Copy `.env.example` to `.env`; set the real worker token, API URL and exact API/Supabase hostnames. Never commit `.env`.
2. Check the resolved Compose model and start the containers:

   ```bash
   docker compose config --quiet
   docker compose up -d --build
   docker compose ps
   ```

3. Verify the actual container network addresses and routes:

   ```bash
   docker inspect "$(docker compose ps -q paperpilot-converter)"
   docker network inspect worker_worker-private
   docker network inspect worker_worker-egress
   ```

   Compose network names may be prefixed by the project name. Confirm the converter has both interfaces, ClamAV has both, Prometheus has only the private network, and the egress network is the default gateway for the converter and ClamAV.

4. Inspect the firewall script before applying it:

   ```bash
   set -a
   source .env
   set +a
   ./egress-firewall.sh --dry-run
   ```

   Confirm the printed API/Supabase and ClamAV IPv4 destinations are the expected current DNS answers. Confirm the worker and ClamAV egress IPs match the Compose addresses.

5. Apply only on the actual worker host, from a root shell after review:

   ```bash
   sudo env \
     PAPERPILOT_API_HOST="$PAPERPILOT_API_HOST" \
     SUPABASE_HOST="$SUPABASE_HOST" \
     CLAMAV_UPDATE_HOST="$CLAMAV_UPDATE_HOST" \
     PAPERPILOT_WORKER_EGRESS_IP="$PAPERPILOT_WORKER_EGRESS_IP" \
     PAPERPILOT_CLAMAV_EGRESS_IP="$PAPERPILOT_CLAMAV_EGRESS_IP" \
     PAPERPILOT_EGRESS_GATEWAY="$PAPERPILOT_EGRESS_GATEWAY" \
     ./egress-firewall.sh --apply
   sudo nft list table inet paperpilot_worker_egress
   ```

   The script installs host INPUT rules denying these container source IPs access to host services, and FORWARD rules allowing only TCP 443 to the resolved destination sets. All other forwarded IPv4 traffic from those two egress IPs is dropped.

## Required live checks

Run these after applying the firewall and restarting the worker:

- `docker compose ps`: converter must become healthy; ClamAV must finish signature initialization.
- `curl -fsS http://127.0.0.1:8080/healthz` and `curl -fsS http://127.0.0.1:8080/readyz`: liveness and scanner readiness.
- `curl -fsS http://127.0.0.1:9090/-/ready`: Prometheus ready.
- `curl -fsS http://127.0.0.1:9090/api/v1/targets`: `paperpilot-worker` target must be UP.
- `curl -fsS http://127.0.0.1:9090/api/v1/rules`: all five PaperPilot alert rules must be loaded.
- `sudo ss -lntp`: 8080 and 9090 must be bound only to 127.0.0.1; no host listener should exist for 3310.
- `sudo nft list table inet paperpilot_worker_egress`: both INPUT and FORWARD chains and both source IPs must be present.
- From inside the converter container, verify PaperPilot API and Supabase HTTPS succeed, while arbitrary external HTTPS, HTTP, SMTP, host-gateway services and cloud metadata destinations fail. Do not use production credentials in diagnostic commands.
- Confirm ClamAV can refresh signatures through its configured update host and that a current signature database is loaded. The firewall script uses DNS-derived IP addresses; refresh the rules when DNS answers change.

## Monitoring scope and gaps

Prometheus scrapes the worker every 15 seconds. Metrics contain only bounded result labels and durations; no user/job identifiers, file names, signed URLs or secrets. Five rules cover scrape outage, stale queue polling, repeated conversion failures, scanner failures and cleanup errors.

No Alertmanager receiver is configured. Prometheus can evaluate and display firing alerts, but it will not notify an operator until a receiver and delivery destination are configured. Host CPU/memory/disk, Docker daemon health, ClamAV signature age, backup/restore, retention compliance and SLO dashboards are not covered by the worker metrics.

## Important limitations

- The firewall is IPv4-only. Compose does not enable IPv6 on these networks by default, but verify this on the host; do not approve production until there is no IPv6 egress bypass.
- DNS-derived IP allowlisting is not strict hostname/SNI enforcement. Shared CDN addresses may serve other hostnames. If strict destination identity is required, use a dedicated authenticated egress proxy with explicit hostname allowlists and configure the worker's HTTP client to use it.
- A DNS answer may vary between the host and Docker's resolver. If allowed traffic fails, compare the container's DNS answers with the firewall set and update the set deliberately; do not broaden the allowlist to all internet traffic.
- The script has not been applied by CI and must not be considered active until the host operator runs it and completes the live checks above.
- No production host, firewall, Prometheus target or alert delivery path was accessible to this repository change. Keep production approval blocked until evidence from the actual host is recorded.
