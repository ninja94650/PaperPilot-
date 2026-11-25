import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(pathToFileURL(resolve(process.cwd(), "package.json")));

export async function resolveModule(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return {
      url: pathToFileURL(resolve(process.cwd(), specifier.slice(2))).href,
      shortCircuit: true
    };
  }
  if (specifier === "next/server") {
    return { url: pathToFileURL(require.resolve("next/server")).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
export { resolveModule as resolve };
