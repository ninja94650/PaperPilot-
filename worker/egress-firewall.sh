#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---dry-run}"
if [[ "$MODE" != "--dry-run" && "$MODE" != "--apply" ]]; then
  echo "Usage: $0 [--dry-run|--apply]" >&2
  exit 2
fi

: "${PAPERPILOT_API_HOST:?Set PAPERPILOT_API_HOST to the exact PaperPilot API hostname}"
: "${SUPABASE_HOST:?Set SUPABASE_HOST to the exact Supabase project hostname}"
: "${CLAMAV_UPDATE_HOST:=database.clamav.net}"
: "${PAPERPILOT_WORKER_EGRESS_IP:=172.30.42.10}"
: "${PAPERPILOT_CLAMAV_EGRESS_IP:=172.30.42.11}"
: "${PAPERPILOT_EGRESS_GATEWAY:=172.30.42.1}"

resolve_ipv4() {
  local host="$1"
  getent ahostsv4 "$host" | awk '{print $1}' | sort -u
}

mapfile -t worker_ips < <({ resolve_ipv4 "$PAPERPILOT_API_HOST"; resolve_ipv4 "$SUPABASE_HOST"; } | sort -u)
mapfile -t clamav_ips < <(resolve_ipv4 "$CLAMAV_UPDATE_HOST" | sort -u)
if [[ "${#worker_ips[@]}" -eq 0 || "${#clamav_ips[@]}" -eq 0 ]]; then
  echo "DNS resolution failed; refusing to generate an empty egress allowlist." >&2
  exit 1
fi

join_csv() { local IFS=,; echo "$*"; }
WORKER_DESTINATIONS="$(join_csv "${worker_ips[@]}")"
CLAMAV_DESTINATIONS="$(join_csv "${clamav_ips[@]}")"
RULES="$(mktemp)"
trap 'rm -f "$RULES"' EXIT

if [[ "$MODE" == "--apply" ]]; then
  if [[ "$EUID" -ne 0 ]]; then
    echo "--apply requires root on the Docker host." >&2
    exit 1
  fi
  command -v nft >/dev/null || { echo "nftables is required on the Docker host." >&2; exit 1; }
  if nft list table inet paperpilot_worker_egress >/dev/null 2>&1; then
    printf 'delete table inet paperpilot_worker_egress\n' >> "$RULES"
  fi
fi

cat >> "$RULES" <<EOF
table inet paperpilot_worker_egress {
  set worker_destinations {
    type ipv4_addr
    flags interval
    elements = { $WORKER_DESTINATIONS }
  }
  set clamav_destinations {
    type ipv4_addr
    flags interval
    elements = { $CLAMAV_DESTINATIONS }
  }
  chain forward {
    type filter hook forward priority -5; policy accept;
    ip saddr $PAPERPILOT_WORKER_EGRESS_IP ip daddr $PAPERPILOT_EGRESS_GATEWAY drop
    ip saddr $PAPERPILOT_WORKER_EGRESS_IP ct state established,related accept
    ip saddr $PAPERPILOT_WORKER_EGRESS_IP ip daddr @worker_destinations tcp dport 443 accept
    ip saddr $PAPERPILOT_WORKER_EGRESS_IP drop
    ip saddr $PAPERPILOT_CLAMAV_EGRESS_IP ip daddr $PAPERPILOT_EGRESS_GATEWAY drop
    ip saddr $PAPERPILOT_CLAMAV_EGRESS_IP ct state established,related accept
    ip saddr $PAPERPILOT_CLAMAV_EGRESS_IP ip daddr @clamav_destinations tcp dport 443 accept
    ip saddr $PAPERPILOT_CLAMAV_EGRESS_IP drop
  }
}
EOF

echo "Resolved worker API/Supabase IPv4 destinations: $WORKER_DESTINATIONS"
echo "Resolved ClamAV update IPv4 destinations: $CLAMAV_DESTINATIONS"
echo "Worker egress IP: $PAPERPILOT_WORKER_EGRESS_IP; ClamAV egress IP: $PAPERPILOT_CLAMAV_EGRESS_IP"
if [[ "$MODE" == "--dry-run" ]]; then
  echo "DRY RUN: no firewall changes applied. Review rules below; use --apply only on the worker host."
  cat "$RULES"
  exit 0
fi

nft -c -f "$RULES"
nft -f "$RULES"
echo "Applied PaperPilot worker egress rules. Re-run after DNS changes and verify with the deployment checks."
