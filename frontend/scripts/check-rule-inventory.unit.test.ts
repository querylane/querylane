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
    config: "tsconfig.strict.json",
    original: '"compilerOptions": {',
    replacement:
      '// Shared compiler policy supports JSONC.\n  "compilerOptions": {',
    rule: "valid compiler comments",
    status: 0,
    message: "Every installed rule has a recorded policy decision.",
  },
  {
    config: "biome.jsonc",
    original: '"extends": ["ultracite/biome/playwright"],',
    replacement: "",
    rule: "missing Playwright inheritance",
    message: "Unreviewed Biome preset inheritance",
  },
  {
    config: "biome.jsonc",
    original: '"extends": ["ultracite/biome/playwright"]',
    replacement:
      '"extends": ["ultracite/biome/playwright", "./quality/unreviewed-biome.jsonc"]',
    rule: "hidden preset inheritance",
    message: "Unreviewed Biome preset inheritance",
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
    original: '"src/components/ui/**",',
    replacement: '"src/components/ui/**", "src/features/**",',
    rule: "authored source presented as generated",
    message: "Quality engine cannot be disabled",
  },
  {
    config: "oxlint.config.ts",
    original: "overrides: [",
    replacement:
      'overrides: [{ files: ["src/features/**"], plugins: [], rules: {} },',
    rule: "per-role engine bypass",
    message: "Oxlint overrides cannot alter engine or coverage settings",
  },
  {
    config: "tsconfig.browser-js.json",
    original: '"checkJs": true',
    replacement: '"checkJs": false',
    rule: "unchecked public JavaScript",
    message:
      "Compiler contract is not enforced: tsconfig.browser-js.json/checkJs",
  },
  {
    config: "biome.jsonc",
    original: '"overrides": [',
    replacement:
      '"overrides": [{ "includes": ["src/features/**"], "linter": { "rules": { "suspicious": { "noDebugger": "off" } } } },',
    rule: "hidden Biome waiver",
    message: "Unreviewed Biome override",
  },
  {
    config: "biome.jsonc",
    original: '"overrides": [',
    replacement:
      '"overrides": [{ "includes": ["src/features/**"], "linter": { "rules": { "suspicious": { "noLeakedRender": "error" } } } },',
    rule: "hidden conflicting Biome rule",
    message: "Unreviewed Biome override",
  },
  {
    config: "biome.jsonc",
    original: '"overrides": [',
    replacement:
      '"overrides": [{ "includes": ["src/features/**"], "linter": { "enabled": false } },',
    rule: "disabled source engine",
    message: "Quality engine cannot be disabled",
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
    config: "biome.jsonc",
    original: '"!!src/protogen",',
    replacement: '"!!src/protogen", "!!src/features",',
    rule: "hidden Biome source exclusion",
    message: "Unreviewed Biome exclusion",
  },
  {
    config: "biome.jsonc",
    original: '"**",',
    replacement: '"src/**",',
    rule: "narrowed Biome source coverage",
    message: "Biome must cover all authored file roles",
  },
  {
    config: "oxlint.config.ts",
    original: "overrides: [",
    replacement:
      'overrides: [{ files: ["src/features/**"], rules: { "typescript/no-floating-promises": "off" } },',
    rule: "hidden typed waiver",
    message: "Unreviewed Oxlint override",
  },
  {
    config: "oxlint.config.ts",
    original: "ignorePatterns: [",
    replacement: 'ignorePatterns: ["src/features/**",',
    rule: "hidden typed source exclusion",
    message: "Unreviewed Oxlint exclusion",
  },
  {
    config: "oxlint.config.ts",
    original: "typeAware: true",
    replacement: "typeAware: false",
    rule: "disabled editor typed checks",
    message: "Oxlint must retain type-aware fatal checks",
  },
  {
    config: "doctor.config.ts",
    original: "files: [",
    replacement: 'files: ["src/features/**",',
    rule: "hidden Doctor source exclusion",
    message: "Unreviewed Doctor exclusion",
  },
  {
    config: "doctor.config.ts",
    original: "lint: true",
    replacement: "lint: false",
    rule: "disabled Doctor analysis",
    message: "Doctor must retain full fatal analysis",
  },
  {
    config: "tsconfig.json",
    original: '"target": "ESNext",',
    replacement: '"target": "ESNext", "strict": false,',
    rule: "weakened application compiler",
    message: "Compiler contract is not enforced: tsconfig.json/strict",
  },
  {
    config: "tsconfig.json",
    original: '"src",',
    replacement: '"src/env.ts",',
    rule: "narrowed compiler source coverage",
    message: "Compiler coverage is not enforced: tsconfig.json",
  },
  {
    config: "tsconfig.json",
    original: '"exclude": [',
    replacement: '"exclude": ["src/features",',
    rule: "hidden compiler source exclusion",
    message: "Compiler coverage is not enforced: tsconfig.json",
  },
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
    message: "Quality engine cannot be disabled: linter",
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
    message: "Quality engine cannot be disabled: assist",
  },
  {
    config: "tsconfig.strict.json",
    original: '"noImplicitReturns": true',
    replacement: '"noImplicitReturns": false',
    rule: "typescript/consistent-return",
    message:
      "Compiler contract is not enforced: tsconfig.json/noImplicitReturns",
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
    message: "Unreviewed Oxlint override",
  },
  {
    config: "oxlint.config.ts",
    original: 'files: ["src/lib/domain/**/*.ts", "src/lib/pagination.ts"]',
    replacement: 'files: ["src/lib/domain/quality-probe-*/**/*.ts"]',
    rule: "typescript/explicit-module-boundary-types",
    message:
      "Reviewed rule scope is not enforced: typescript/explicit-module-boundary-types",
  },
])("enforces reviewed quality policy: $rule -> $replacement", (scenario) => {
  const source = resolve(import.meta.dirname, "..");
  const root = mkdtempSync(join(tmpdir(), "querylane-rule-policy-"));
  try {
    for (const file of [
      "scripts/check-rule-inventory.ts",
      "scripts/quality-boundaries.ts",
      "src/lib/value-guards.ts",
      "quality/rule-inventory.json",
      "package.json",
      "tsconfig.strict.json",
      "tsconfig.json",
      "tsconfig.node.json",
      "tsconfig.browser-js.json",
      "tsconfig.ui.json",
      "tsconfig.declarations.json",
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
      join(root, "quality/unreviewed-biome.jsonc"),
      JSON.stringify({
        root: false,
        overrides: [{ includes: ["**"], linter: { enabled: false } }],
      })
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
