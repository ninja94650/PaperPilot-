import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const compose = await readFile(new URL("./compose.yaml", import.meta.url), "utf8");
const prometheus = await readFile(new URL("./prometheus.yml", import.meta.url), "utf8");
const firewall = await readFile(new URL("./egress-firewall.sh", import.meta.url), "utf8");

test("ClamAV is never published to the host and uses the private worker network", () => {
  const clamav = compose.split("  paperpilot-converter:")[0];
  assert.match(clamav, /expose:\s*\n\s*- "3310"/);
  assert.doesNotMatch(clamav, /\n\s*ports:/);
  assert.match(clamav, /worker-private:/);
  assert.match(clamav, /worker-egress:/);
});

test("worker API port and Prometheus UI are loopback-only; metrics are private-network scraped", () => {
  const worker = compose.split("  paperpilot-converter:")[1].split("  prometheus:")[0];
  const monitoring = compose.split("  prometheus:")[1].split("\nnetworks:")[0];
  assert.match(worker, /127\.0\.0\.1:8080:8080/);
  assert.match(worker, /worker-private:/);
  assert.match(worker, /worker-egress:/);
  assert.match(worker, /CLAMAV_HOST:.*PAPERPILOT_CLAMAV_PRIVATE_IP/);
  assert.match(worker, /gw_priority: 1/);
  assert.match(worker, /gw_priority: 0/);
  assert.match(worker, /\/readyz/);
  assert.match(monitoring, /127\.0\.0\.1:9090:9090/);
  assert.doesNotMatch(monitoring, /worker-egress/);
  assert.match(prometheus, /paperpilot-converter:8080/);
  assert.match(prometheus, /metrics_path: \/metrics/);
});

test("private network has no default egress and resource limits remain explicit", () => {
  assert.match(compose, /worker-private:\s*\n\s*internal: true/);
  assert.match(compose, /mem_limit: 4g/);
  assert.match(compose, /mem_limit: 2g/);
  assert.match(compose, /mem_limit: 512m/);
  assert.match(compose, /pids_limit: 120/);
});

test("host egress policy is allowlist-only and requires explicit apply", () => {
  assert.match(firewall, /PAPERPILOT_API_HOST/);
  assert.match(firewall, /SUPABASE_HOST/);
  assert.match(firewall, /CLAMAV_UPDATE_HOST/);
  assert.match(firewall, /tcp dport 443 accept/);
  assert.match(firewall, /ip saddr \$PAPERPILOT_WORKER_EGRESS_IP drop/);
  assert.match(firewall, /ip saddr \$PAPERPILOT_CLAMAV_EGRESS_IP drop/);
  assert.match(firewall, /chain input/);
  assert.match(firewall, /--apply/);
  assert.match(firewall, /DRY RUN/);
  const syntax = spawnSync("bash", ["-n", new URL("./egress-firewall.sh", import.meta.url).pathname], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);
});
