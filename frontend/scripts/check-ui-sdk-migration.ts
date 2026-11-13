import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isRecord } from "../src/lib/value-guards";

const REPLACED_PACKAGES = [
  "@base-ui/react",
  "cmdk",
  "react-resizable-panels",
  "sonner",
  "next-themes",
];
const SDK_VERSION = "0.1.0-beta.2";

function referencesPackage(source: string, name: string) {
  return [`"${name}"`, `"${name}/`, `'${name}'`, `'${name}/`].some(
    (specifier) => source.includes(specifier)
  );
}

function sourceViolations(files: ReadonlyMap<string, string>) {
  const violations: string[] = [];
  for (const [path, source] of files) {
    for (const name of REPLACED_PACKAGES) {
      if (referencesPackage(source, name)) {
        violations.push(`${path} still references ${name}`);
      }
    }
  }
  return violations;
}

function migrationViolations(
  manifest: unknown,
  files: ReadonlyMap<string, string>
) {
  const violations: string[] = [];
  const dependencies =
    isRecord(manifest) && isRecord(manifest["dependencies"])
      ? manifest["dependencies"]
      : {};
  for (const name of ["@ui-sdk/react", "@ui-sdk/core"]) {
    if (dependencies[name] !== SDK_VERSION) {
      violations.push(`${name} must be pinned to ${SDK_VERSION}`);
    }
  }
  for (const name of REPLACED_PACKAGES) {
    if (name in dependencies) {
      violations.push(`Remove replaced dependency ${name}`);
    }
  }
  violations.push(...sourceViolations(files));
  return violations;
}

if (import.meta.main) {
  const root = resolve(import.meta.dirname, "..");
  const manifest: unknown = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf8")
  );
  const files = new Map(
    globSync("src/**/*.{ts,tsx}", { cwd: root }).map((path) => [
      path,
      readFileSync(resolve(root, path), "utf8"),
    ])
  );
  const violations = migrationViolations(manifest, files);
  if (violations.length > 0) {
    throw new Error(violations.join("\n"));
  }
  console.log("UI SDK pins and application imports are consistent.");
}

export { migrationViolations };
