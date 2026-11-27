import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const allowed = new Set(["MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "0BSD"]);
const entries = [];

function readPackage(name, requested, scope) {
  const manifestPath = join(root, "node_modules", ...name.split("/"), "package.json");
  if (!existsSync(manifestPath)) {
    throw new Error("Installed package metadata is missing for " + name);
  }
  const metadata = JSON.parse(readFileSync(manifestPath, "utf8"));
  const rawLicense = metadata.license;
  const license = typeof rawLicense === "string"
    ? rawLicense
    : rawLicense && typeof rawLicense === "object" && typeof rawLicense.type === "string"
      ? rawLicense.type
      : "UNKNOWN";
  const repository = typeof metadata.repository === "string"
    ? metadata.repository
    : metadata.repository?.url ?? "";
  entries.push({
    name,
    requested,
    version: metadata.version ?? "UNKNOWN",
    license,
    repository: String(repository).replace(/^git\+/, "").replace(/\.git$/, ""),
    scope
  });
}

for (const [scope, packages] of [
  ["Production", manifest.dependencies ?? {}],
  ["Development", manifest.devDependencies ?? {}]
]) {
  for (const [name, requested] of Object.entries(packages).sort(([a], [b]) => a.localeCompare(b))) {
    readPackage(name, requested, scope);
  }
}

for (const [name, requested] of Object.entries(manifest.overrides ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
  if (!entries.some((entry) => entry.name === name)) {
    readPackage(name, requested, "Transitive security override");
  }
}

const escapeCell = (value) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
const rows = entries.map((entry) =>
  "| " + escapeCell(entry.scope) + " | " + escapeCell(entry.name) + " | " +
  escapeCell(entry.requested) + " | " + escapeCell(entry.version) + " | " +
  escapeCell(entry.license) + " | " + (entry.repository ? "[" + escapeCell(entry.repository) + "](" + entry.repository + ")" : "—") + " |"
);
const content = [
  "# PaperPilot licensing register",
  "",
  "Generated from installed package metadata by npm run licensing:generate.",
  "Only permissive direct dependency licences are accepted by this initial gate; transitive components are represented in sbom.cdx.json and still require release review.",
  "",
  "| Scope | Package | Manifest constraint | Resolved version | Declared licence | Upstream |",
  "|---|---|---:|---:|---|---|",
  ...rows,
  "",
  "## Policy",
  "",
  "- No paid SDK, API, font, image, template or hosted dependency is approved by this register.",
  "- Direct dependencies and explicit security overrides must declare MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause or 0BSD.",
  "- Unknown or non-allowlisted direct dependency licences fail generation and must be reviewed before use.",
  "- sbom.cdx.json records the resolved dependency graph; transitive licence obligations and bundled notices must be reviewed before public distribution.",
  "- Re-run the generator and refresh the SBOM whenever package manifests or lockfiles change.",
  "",
  "This is an engineering inventory, not legal advice."
].join("\n") + "\n";

const rejected = entries.filter((entry) => !allowed.has(entry.license));
writeFileSync(join(root, "docs/licensing-register.md"), content);
console.log("Recorded " + entries.length + " direct dependencies and overrides.");
if (rejected.length) {
  console.error("Review required for licences: " + rejected.map((entry) => entry.name + " (" + entry.license + ")").join(", "));
  process.exitCode = 1;
}
