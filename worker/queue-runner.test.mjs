import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { convert } from "./queue-runner.mjs";

test("cancellation terminates the Office child and rejects conversion", { timeout: 5000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "paperpilot-cancel-test-"));
  const binary = join(directory, "libreoffice");
  const previousPath = process.env.PATH || "";
  const controller = new AbortController();
  try {
    await writeFile(binary, "#!/bin/sh\nexec sleep 30\n", { mode: 0o700 });
    await chmod(binary, 0o700);
    process.env.PATH = directory + delimiter + previousPath;
    const conversion = convert(Buffer.from("synthetic office input"), "test.doc", ".doc", controller.signal);
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(conversion, /cancelled|lease lost/i);
  } finally {
    process.env.PATH = previousPath;
    controller.abort();
    await rm(directory, { recursive: true, force: true });
  }
});
