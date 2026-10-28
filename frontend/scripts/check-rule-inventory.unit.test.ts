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
import { assertReviewedRuleIds } from "./check-rule-inventory";

test("rejects a new tool rule until its policy is reviewed", () => {
  expect(() => {
    assertReviewedRuleIds(["tool/known"], ["tool/known", "tool/new"]);
  }).toThrow("tool/new");
});
test("rejects stale and duplicate inventory entries", () => {
  expect(() => {
    assertReviewedRuleIds(["tool/removed"], []);
  }).toThrow("tool/removed");
  expect(() => {
    assertReviewedRuleIds(["tool/known", "tool/known"], ["tool/known"]);
  }).toThrow("Duplicate");
});
test("accepts the same reviewed catalog in a different order", () => {
  expect(() => {
    assertReviewedRuleIds(["tool/a", "tool/b"], ["tool/b", "tool/a"]);
  }).not.toThrow();
});

test.each([
  {
    config: "biome.jsonc",
    original: '"noDebugger": "error"',
    replacement: '"noDebugger": "off"',
    rule: "suspicious/noDebugger",
  },
  {
    config: "biome.jsonc",
    original: '"noDebugger": "error"',
    replacement: '"noDebugger": "warn"',
    rule: "suspicious/noDebugger",
  },
  {
    config: "doctor.config.ts",
    original: '"react-doctor/no-array-index-key": "error"',
    replacement: '"react-doctor/no-array-index-key": "off"',
    rule: "react-doctor/no-array-index-key",
  },
  {
    config: "oxlint.config.ts",
    original: '"shadcn/no-restyle": [\n      "error",',
    replacement: '"shadcn/no-restyle": [\n      "off",',
    rule: "shadcn/no-restyle",
  },
  {
    config: "doctor.config.ts",
    original: "rules: [],",
    replacement: 'rules: ["react-doctor/no-array-index-key"],',
    rule: "react-doctor/no-array-index-key",
    message: "Doctor rule, tag and per-file suppressions are not permitted",
  },
  {
    config: "biome.jsonc",
    original: '"linter": {',
    replacement: '"linter": { "enabled": false,',
    rule: "Biome linter",
    message: "Biome linter must remain enabled",
  },
  {
    config: "biome.jsonc",
    original: '"noLeakedRender": "off"',
    replacement: '"noLeakedRender": "error"',
    rule: "suspicious/noLeakedRender",
    message: "Reviewed disabled rule is not off: suspicious/noLeakedRender",
  },
  {
    config: "biome.jsonc",
    original: '"noLeakedRender": "off",',
    replacement: "",
    rule: "suspicious/noLeakedRender",
    message: "Reviewed disabled rule is not off: suspicious/noLeakedRender",
  },
  {
    config: "oxlint.config.ts",
    original: '"typescript/no-invalid-void-type": "off"',
    replacement: '"typescript/no-invalid-void-type": "error"',
    rule: "typescript/no-invalid-void-type",
    message:
      "Reviewed disabled rule is not off: typescript/no-invalid-void-type",
  },
  {
    config: "biome.jsonc",
    original: '"noPlaywrightWaitForTimeout": "error"',
    replacement: '"noPlaywrightWaitForTimeout": "off"',
    rule: "suspicious/noPlaywrightWaitForTimeout",
    inventoryDecision: "inapplicable",
    message:
      "Playwright preset rule is not enforced: suspicious/noPlaywrightWaitForTimeout",
  },
  {
    config: "biome.jsonc",
    original: '"organizeImports": "on"',
    replacement: '"organizeImports": "off"',
    rule: "eslint/sort-imports",
    message:
      "Delegated owner is not enforced: eslint/sort-imports -> biome/assist/source/organizeImports",
  },
  {
    config: "biome.jsonc",
    original: '"assist": {',
    replacement: '"assist": { "enabled": false,',
    rule: "eslint/sort-imports",
    message:
      "Delegated owner is not enforced: eslint/sort-imports -> biome/assist/source/organizeImports",
  },
  {
    config: "tsconfig.strict.json",
    original: '"noImplicitReturns": true',
    replacement: '"noImplicitReturns": false',
    rule: "typescript/consistent-return",
    message:
      "Delegated owner is not enforced: typescript/consistent-return -> typescript/noImplicitReturns",
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
    original: '"typescript/prefer-readonly-parameter-types": "error"',
    replacement: '"typescript/prefer-readonly-parameter-types": "off"',
    rule: "typescript/prefer-readonly-parameter-types",
  },
  {
    config: "oxlint.config.ts",
    original: 'files: ["src/lib/domain/**/*.ts", "src/lib/pagination.ts"]',
    replacement: 'files: ["src/lib/domain/quality-probe-*/**/*.ts"]',
    rule: "typescript/explicit-module-boundary-types",
    message:
      "Reviewed rule scope is not enforced: typescript/explicit-module-boundary-types",
  },
])("rejects a silent policy downgrade: $rule -> $replacement", (scenario) => {
  const source = resolve(import.meta.dirname, "..");
  const root = mkdtempSync(join(tmpdir(), "querylane-rule-policy-"));
  try {
    for (const file of [
      "scripts/check-rule-inventory.ts",
      "src/lib/value-guards.ts",
      "quality/rule-inventory.json",
      "package.json",
      "tsconfig.strict.json",
      "biome.jsonc",
      "oxlint.config.ts",
      "doctor.config.ts",
    ]) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      cpSync(join(source, file), join(root, file));
    }
    symlinkSync(join(source, "node_modules"), join(root, "node_modules"));
    const config = join(root, scenario.config);
    const original = readFileSync(config, "utf8");
    const modified = original.replace(scenario.original, scenario.replacement);
    expect(modified).not.toBe(original);
    writeFileSync(config, modified);
    if ("inventoryDecision" in scenario) {
      const inventoryPath = join(root, "quality/rule-inventory.json");
      const inventory = readFileSync(inventoryPath, "utf8");
      const originalPolicy = `"rule": "${scenario.rule}",\n      "decision": "error"`;
      const replacementPolicy = `"rule": "${scenario.rule}",\n      "decision": "${scenario.inventoryDecision}"`;
      if (!inventory.includes(originalPolicy)) {
        throw new Error(`Missing fixture policy: ${scenario.rule}`);
      }
      writeFileSync(
        inventoryPath,
        inventory.replace(originalPolicy, replacementPolicy)
      );
    }
    const result = spawnSync(
      "bun",
      [join(root, "scripts/check-rule-inventory.ts")],
      { cwd: root, encoding: "utf8" }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "message" in scenario
        ? scenario.message
        : `Reviewed error rule is not enforced: ${scenario.rule}`
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});
