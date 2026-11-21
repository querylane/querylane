import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isRecord } from "../src/lib/value-guards";

const REPLACED_PACKAGES = [
  "cmdk",
  "react-resizable-panels",
  "sonner",
  "next-themes",
];
const REQUIRED_PACKAGES = {
  "@base-ui/react": "1.9.0",
  "@ui-sdk/react": "0.1.0-beta.13",
  "@ui-sdk/core": "0.1.0-beta.13",
};
const BASE_UI_FOUNDATIONS = [
  "button",
  "input",
  "dialog",
  "select",
  "popover",
  "tabs",
  "checkbox",
  "switch",
];

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

function foundationViolations(files: ReadonlyMap<string, string>) {
  const violations: string[] = [];
  for (const name of BASE_UI_FOUNDATIONS) {
    const path = `src/components/ui/${name}.tsx`;
    const source = files.get(path);
    if (source !== undefined && !referencesPackage(source, "@base-ui/react")) {
      violations.push(`${path} must keep Base UI as its foundation`);
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
  for (const [name, version] of Object.entries(REQUIRED_PACKAGES)) {
    if (dependencies[name] !== version) {
      violations.push(`${name} must be pinned to ${version}`);
    }
  }
  for (const name of REPLACED_PACKAGES) {
    if (name in dependencies) {
      violations.push(`Remove replaced dependency ${name}`);
    }
  }
  violations.push(...sourceViolations(files), ...foundationViolations(files));
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
  console.log(
    "Base UI foundations and UI SDK enhancement pins are consistent."
  );
}

export { migrationViolations };
