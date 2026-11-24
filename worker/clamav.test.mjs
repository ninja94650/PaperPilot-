import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { scanWithClamAv } from "./clamav.mjs";

async function withClamAv(scanResponse, run) {
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let mode = "command";
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (mode === "command") {
        const end = buffer.indexOf(0);
        if (end < 0) return;
        const command = buffer.subarray(0, end).toString("utf8");
        buffer = buffer.subarray(end + 1);
        if (command === "zVERSION") {
          socket.end("ClamAV 1.4.0/test\0");
          return;
        }
        if (command !== "zINSTREAM") {
          socket.end("UNKNOWN COMMAND\0");
          return;
        }
        mode = "stream";
      }
      if (mode === "stream") {
        while (buffer.length >= 4) {
          const size = buffer.readUInt32BE(0);
          if (buffer.length < size + 4) return;
          buffer = buffer.subarray(4 + size);
          if (size === 0) {
            socket.end(scanResponse + "\0");
            return;
          }
        }
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try { await run({ host: "127.0.0.1", port: address.port }); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("ClamAV reports a clean streamed document with scanner version", async () => {
  await withClamAv("stream: OK", async (endpoint) => {
    const result = await scanWithClamAv(Buffer.from("%PDF-1.7"), endpoint);
    assert.equal(result.clean, true);
    assert.equal(result.signatureVersion, "ClamAV 1.4.0/test");
  });
});

test("ClamAV reports an infected document as rejected, not clean", async () => {
  await withClamAv("stream: Eicar-Test-Signature FOUND", async (endpoint) => {
    const eicar = "X5O!P%@AP[4\\\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
    const result = await scanWithClamAv(Buffer.from(eicar, "ascii"), endpoint);
    assert.equal(result.clean, false);
    assert.match(result.threat, /FOUND/);
  });
});

test("ClamAV protocol errors fail closed", async () => {
  await withClamAv("stream: ERROR", async (endpoint) => {
    await assert.rejects(scanWithClamAv(Buffer.from("file"), endpoint), /could not complete/i);
  });
});

test("ClamAV rejects empty and oversized scan inputs before connecting", async () => {
  await assert.rejects(scanWithClamAv(Buffer.alloc(0), { host: "127.0.0.1", port: 1 }), /size is invalid/i);
  await assert.rejects(scanWithClamAv(Buffer.alloc(40 * 1024 * 1024 + 1), { host: "127.0.0.1", port: 1 }), /size is invalid/i);
});
