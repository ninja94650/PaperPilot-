import test from "node:test";
import assert from "node:assert/strict";
import { scanWithClamAv } from "./clamav.mjs";

// Set CLAMAV_INTEGRATION=1 only in an isolated worker test environment with fresh signatures.
// EICAR is a harmless industry-standard antivirus test string, not live malware.
const enabled = process.env.CLAMAV_INTEGRATION === "1";
const eicar = "X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

test("live ClamAV detects the canonical EICAR test string", { skip: !enabled, timeout: 45_000 }, async () => {
  const result = await scanWithClamAv(Buffer.from(eicar, "ascii"));
  assert.equal(result.clean, false);
  assert.match(result.threat || "", /Eicar-Test-Signature/i);
  assert.match(result.signatureVersion, /^ClamAV /);
});

test("live ClamAV accepts a harmless synthetic PDF header", { skip: !enabled, timeout: 45_000 }, async () => {
  const result = await scanWithClamAv(Buffer.from("%PDF-1.7\n% PaperPilot integration fixture\n%%EOF", "ascii"));
  assert.equal(result.clean, true);
  assert.match(result.signatureVersion, /^ClamAV /);
});
