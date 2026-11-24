import net from "node:net";

function command(host, port, payload, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const chunks = [];
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error("ClamAV scan timed out.")), timeoutMs);
    socket.once("error", (error) => finish(error));
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      const joined = Buffer.concat(chunks);
      if (joined.includes(0)) finish(null, joined.toString("utf8").replace(/\0.*$/s, "").trim());
    });
    socket.once("connect", () => {
      if (typeof payload === "string") socket.write(Buffer.from(payload + "\0"));
      else {
        socket.write(Buffer.from("zINSTREAM\0"));
        for (let offset = 0; offset < payload.length; offset += 64 * 1024) {
          const part = payload.subarray(offset, Math.min(offset + 64 * 1024, payload.length));
          const length = Buffer.alloc(4);
          length.writeUInt32BE(part.length, 0);
          socket.write(length);
          socket.write(part);
        }
        socket.end(Buffer.alloc(4));
      }
    });
  });
}

export async function getClamAvVersion({ host = process.env.CLAMAV_HOST || "clamav", port = Number(process.env.CLAMAV_PORT || 3310) } = {}) {
  const result = await command(host, port, "zVERSION");
  if (!result.startsWith("ClamAV ")) throw new Error("ClamAV returned an unexpected version response.");
  return result.slice(0, 120);
}

export async function scanWithClamAv(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1 || buffer.length > 40 * 1024 * 1024) {
    throw new Error("The scan input size is invalid.");
  }
  const host = options.host || process.env.CLAMAV_HOST || "clamav";
  const port = options.port || Number(process.env.CLAMAV_PORT || 3310);
  const timeoutMs = options.timeoutMs || 30_000;
  const [version, result] = await Promise.all([
    getClamAvVersion({ host, port }),
    command(host, port, buffer, timeoutMs)
  ]);
  if (result.endsWith(": OK")) return { clean: true, signatureVersion: version };
  if (result.includes("FOUND")) return { clean: false, signatureVersion: version, threat: result.slice(0, 200) };
  throw new Error("ClamAV could not complete the scan: " + result.slice(0, 200));
}
