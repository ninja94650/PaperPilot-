import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function resolveModule(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return {
      url: pathToFileURL(resolve(process.cwd(), specifier.slice(2))).href,
      shortCircuit: true
    };
  }
  return nextResolve(specifier, context);
}
export { resolveModule as resolve };
