import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { scanWithClamAv } from "./clamav.mjs";

async function fakeClamAv(scanResponse) {
  const server = net.createServer((socket) => {
    let command = "";
    socket.on("data", (chunk) => {
      if (!command) {
        command = chunk.subarray(0, Math.min(chunk.length, 20)).toString("utf8");
        if (command.startsWith("zVERSION")) {
          socket.end(Buffer.from("ClamAV 1.4.2/123/Fri Nov 20 00:00:00 2026\0"));
        }
      }
    });
    socket.on("end", () => {
      if (command.startsWith("zINSTREAM")) socket.end(Buffer.from(scanResponse + "\0"));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { host: "127.0.0.1", port: address.port, close: () => new Promise((resolve) => server.close(resolve)) };
}

test("ClamAV client accepts a clean stream and returns signature version", async () => {
  const fake = await fakeClamAv("stream: OK");
  try {
    const result = await scanWithClamAv(Buffer.from("safe synthetic document"), fake);
    assert.equal(result.clean, true);
    assert.match(result.signatureVersion, /^ClamAV 1\.4\.2/);
  } finally { await fake.close(); }
});

test("ClamAV client rejects a stream reported as infected", async () => {
  const fake = await fakeClamAv("stream: Eicar-Test-Signature FOUND");
  try {
    const result = await scanWithClamAv(Buffer.from("synthetic test payload"), fake);
    assert.equal(result.clean, false);
    assert.match(result.threat, /FOUND/);
  } finally { await fake.close(); }
});

test("ClamAV client rejects empty or oversized inputs before connecting", async () => {
  await assert.rejects(() => scanWithClamAv(Buffer.alloc(0), { host: "127.0.0.1", port: 1 }), /size is invalid/);
});
