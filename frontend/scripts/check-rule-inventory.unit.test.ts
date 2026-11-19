import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "@rstest/core";

function addAuthoredDeclaration(root: string, extension?: string) {
  if (extension !== undefined) {
    writeFileSync(
      join(root, `src/extra.d.${extension}`),
      "declare const extra: string;\n"
    );
  }
}

test.each([
  {
    config: "biome.jsonc",
    original: '"root": true',
    replacement: '"root": false',
    rule: "inactive nested project scanner",
    message: "Reviewed quality options changed",
  },
  {
    config: "biome.jsonc",
    original: '"includes": ["**/*.{js,jsx,mjs,cjs}"]',
    replacement: '"includes": ["**/*.mjs"]',
    rule: "narrowed JavaScript import validation",
    message:
      "Reviewed rule scope is not enforced: correctness/noUnresolvedImports",
  },
  {
    config: "package.json",
    original: '"lint": "bun scripts/check-rule-inventory.ts && biome ',
    replacement: '"lint": "bun scripts/check-rule-inventory.ts && echo ',
    rule: "successful no-op lint entrypoint",
    message: "Reviewed quality options changed",
  },
  {
    config: "tsconfig.authored-declarations.json",
    original: '"src/import-meta-env.d.ts",',
    replacement: '"src/extra.d.ts", "src/import-meta-env.d.ts",',
    extraDeclaration: "ts",
    rule: "new checked authored declaration",
    status: 0,
    message: "Every installed rule has a recorded policy decision.",
  },
  {
    config: "tsconfig.authored-declarations.json",
    original: '"target": "ESNext"',
    replacement: '"target": "esnext"',
    extraDeclaration: "mts",
    rule: "new unchecked authored mts declaration",
    message: "Authored declaration coverage is not enforced: src/extra.d.mts",
  },
  {
    config: "biome.jsonc",
    original: '"overrides": [',
    replacement:
      '"overrides": [{ "includes": ["src/**"], "files": { "maxSize": 1 } },',
    rule: "narrowed per-role Biome file-size coverage",
    message: "Biome file-size coverage cannot be narrowed",
  },
  {
    config: "biome.jsonc",
    original: '"files": {',
    replacement: '"files": { "experimentalScannerIgnores": ["src"],',
    rule: "unreviewed Biome scanner exclusion",
    message: "Biome scanner exclusions are not permitted",
  },
  {
    config: "package.json",
    original: '"@interfere/landmines": "',
    replacement: '"@interfere/landmines": "0.0.0-audit-',
    inventoryChange: {
      original: '"@interfere/landmines": "',
      replacement: '"@interfere/landmines": "0.0.0-audit-',
    },
    rule: "installed version drift",
    message:
      "Installed @interfere/landmines version does not match the reviewed version",
  },
  {
    config: "oxlint.config.ts",
    original: "categories: {",
    replacement: 'extends: ["./quality/unreviewed-oxlint.json"], categories: {',
    rule: "hidden typed inheritance",
    message:
      "Oxlint presets must remain materialized without inherited overrides",
  },
  {
    config: "tsconfig.strict.json",
    original: '"compilerOptions": {',
    replacement: '"exclude": ["public/hidden.js"], "compilerOptions": {',
    rule: "inherited compiler source exclusion",
    message: "Compiler coverage is not enforced: tsconfig.browser-js.json",
  },
  {
    config: "biome.jsonc",
    original: '"includes": ["scripts/**/*"]',
    replacement: '"includes": ["src/**/*"]',
    rule: "broadened Node waiver",
    message: "Unreviewed Biome override",
  },
  {
    config: "biome.jsonc",
    original: '"javascript": {',
    replacement: '"javascript": { "linter": { "enabled": false },',
    rule: "disabled JavaScript linting",
    message: "Quality engine cannot be disabled",
  },
  {
    config: "biome.jsonc",
    original: '"useIgnoreFile": false',
    replacement: '"useIgnoreFile": true',
    rule: "gitignore coverage bypass",
    message: "Biome must not inherit source exclusions from gitignore",
  },
  {
    config: "doctor.config.ts",
    original: "files: [",
    replacement: 'files: ["src/features/**",',
    rule: "hidden Doctor source exclusion",
    message: "Unreviewed Doctor exclusion",
  },
  {
    config: "biome.jsonc",
    original: '"noDebugger": "error"',
    replacement: '"noDebugger": "warn"',
    rule: "suspicious/noDebugger",
  },
  {
    config: "doctor.config.ts",
    original: "rules: [],",
    replacement: 'rules: ["react-doctor/no-array-index-key"],',
    rule: "react-doctor/no-array-index-key",
    message: "Doctor rule, tag and per-file suppressions are not permitted",
  },
  {
    config: "quality/rule-inventory.json",
    original: '"tool": "biome",\n        "rule": "suspicious/noConsole"',
    replacement:
      '"tool": "biome",\n        "rule": "suspicious/noLeakedRender"',
    rule: "eslint/no-console",
    message:
      "Delegated owner is not enforced: eslint/no-console -> biome/suspicious/noLeakedRender",
  },
  {
    config: "oxlint.config.ts",
    original: "jsPlugins: [",
    replacement:
      'jsPlugins: [{ name: "landmines-testing", specifier: "@interfere/landmines/style" },',
    rule: "substituted Landmines plugin alias",
    message: "Reviewed landmines-testing plugin is not enforced",
  },
  {
    config: "oxlint.config.ts",
    original: "...landmines.rules,",
    replacement:
      '...landmines.rules, "landmines-testing/no-fixed-sleep": "off",',
    rule: "landmines-testing/no-fixed-sleep",
  },
  {
    config: "oxlint.config.ts",
    original: "overrides: [",
    replacement:
      'overrides: [{ files: ["src/features/**"], rules: { "landmines-testing/no-fixed-sleep": "off" } },',
    rule: "hidden Landmines waiver",
    message: "Unreviewed Oxlint override",
  },
])("enforces reviewed quality policy: $rule -> $replacement", (scenario) => {
  const source = resolve(import.meta.dirname, "..");
  const root = mkdtempSync(join(tmpdir(), "querylane-rule-policy-"));
  try {
    for (const file of [
      "scripts/check-rule-inventory.ts",
      "scripts/quality-boundaries.ts",
      "scripts/quality-options.ts",
      "quality/rule-options.json",
      "scripts/querylane-lint.config.ts",
      "src/lib/value-guards.ts",
      "quality/rule-inventory.json",
      "package.json",
      "tsconfig.strict.json",
      "tsconfig.json",
      "tsconfig.node.json",
      "tsconfig.browser-js.json",
      "tsconfig.ui.json",
      "tsconfig.declarations.json",
      "tsconfig.authored-declarations.json",
      "src/import-meta-env.d.ts",
      "src/types/css.d.ts",
      "biome.jsonc",
      "oxlint.config.ts",
      "doctor.config.ts",
    ]) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      cpSync(join(source, file), join(root, file));
    }
    symlinkSync(join(source, "node_modules"), join(root, "node_modules"));
    mkdirSync(join(root, "public"), { recursive: true });
    writeFileSync(
      join(root, "public/quality-probe.js"),
      "export const ready = true;\n"
    );
    writeFileSync(
      join(root, "quality/unreviewed-oxlint.json"),
      JSON.stringify({
        overrides: [
          {
            files: ["src/features/**"],
            rules: { "typescript/no-floating-promises": "off" },
          },
        ],
      })
    );
    addAuthoredDeclaration(root, scenario.extraDeclaration);
    const config = join(root, scenario.config);
    const original = readFileSync(config, "utf8");
    const modified = original.replace(scenario.original, scenario.replacement);
    expect(modified).not.toBe(original);
    writeFileSync(config, modified);
    if (scenario.inventoryChange !== undefined) {
      const inventoryPath = join(root, "quality/rule-inventory.json");
      const inventory = readFileSync(inventoryPath, "utf8");
      const changedInventory = inventory.replace(
        scenario.inventoryChange.original,
        scenario.inventoryChange.replacement
      );
      if (changedInventory === inventory) {
        throw new Error(
          `Missing fixture version: ${scenario.inventoryChange.original}`
        );
      }
      writeFileSync(inventoryPath, changedInventory);
    }
    const result = spawnSync(
      "bun",
      [join(root, "scripts/check-rule-inventory.ts")],
      { cwd: root, encoding: "utf8" }
    );
    expect(result.status).toBe("status" in scenario ? scenario.status : 1);
    expect(result.stdout + result.stderr).toContain(
      "message" in scenario
        ? scenario.message
        : `Reviewed error rule is not enforced: ${scenario.rule}`
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});
