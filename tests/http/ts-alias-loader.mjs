import { resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const require = createRequire(pathToFileURL(resolve(process.cwd(), "package.json")));

export async function resolveModule(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    let target = resolve(process.cwd(), specifier.slice(2));
    if (!extname(target) && !existsSync(target)) {
      if (existsSync(target + ".ts")) target += ".ts";
      else if (existsSync(target + ".mjs")) target += ".mjs";
    }
    return { url: pathToFileURL(target).href, shortCircuit: true };
  }
  if (specifier === "next/server") {
    return { url: pathToFileURL(require.resolve("next/server")).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
export { resolveModule as resolve };
