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
])("rejects a silent policy downgrade: $rule -> $replacement", (scenario) => {
  const source = resolve(import.meta.dirname, "..");
  const root = mkdtempSync(join(tmpdir(), "querylane-rule-policy-"));
  try {
    for (const file of [
      "scripts/check-rule-inventory.ts",
      "src/lib/value-guards.ts",
      "quality/rule-inventory.json",
      "package.json",
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
