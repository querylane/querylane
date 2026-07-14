import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");
const allRulesPresetPattern = /"preset":\s*"all"/;
const complexityLimitPattern = /"maxAllowedComplexity":\s*10/;
const functionLinesLimitPattern = /"maxLines":\s*250/;
const parameterLimitPattern = /"max":\s*3/;
const routeFastRefreshOverridePattern =
  /"includes":\s*\["src\/routes\/\*\*\/\*"\][\s\S]*?"useComponentExportOnlyModules":\s*"off"/;
const allAssistsPresetPattern = /"preset":\s*"all"/g;
const unsafeAssistPatterns = [
  /"useSortedEnumMembers":\s*"off"/,
  /"useSortedKeys":\s*"off"/,
  /"useSortedProperties":\s*"off"/,
];
const disabledBiomeRulePattern = /"([A-Za-z][A-Za-z0-9]+)":\s*"off"/g;
const allowedDisabledBiomeRules = [
  "noConsole",
  "noDefaultExport",
  "noDocumentCookie",
  "noJsxPropsBind",
  "noNodejsModules",
  "noProcessEnv",
  "noSecrets",
  "noSolidDestructuredProps",
  "noUselessUndefined",
  "useComponentExportOnlyModules",
  "useConsistentCurlyBraces",
  "useLiteralKeys",
  "useMaxParams",
  "useQwikValidLexicalScope",
  "useSolidForComponent",
  "useSortedEnumMembers",
  "useSortedKeys",
  "useSortedProperties",
];
const strictTypeScriptOptions = {
  allowJs: false,
  allowUnreachableCode: false,
  allowUnusedLabels: false,
  alwaysStrict: true,
  exactOptionalPropertyTypes: true,
  forceConsistentCasingInFileNames: true,
  isolatedModules: true,
  noCheck: false,
  noEmitOnError: true,
  noFallthroughCasesInSwitch: true,
  noImplicitAny: true,
  noImplicitOverride: true,
  noImplicitReturns: true,
  noImplicitThis: true,
  noPropertyAccessFromIndexSignature: true,
  noUncheckedIndexedAccess: true,
  noUncheckedSideEffectImports: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  skipLibCheck: false,
  strict: true,
  strictBindCallApply: true,
  strictBuiltinIteratorReturn: true,
  strictFunctionTypes: true,
  strictNullChecks: true,
  strictPropertyInitialization: true,
  useUnknownInCatchVariables: true,
  verbatimModuleSyntax: true,
} as const;
const generatedCodeCompatibilityOptions = {
  erasableSyntaxOnly: false,
} as const;

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonRecord(path: string) {
  const parsed: unknown = JSON.parse(
    readFileSync(resolve(projectRoot, path), "utf8")
  );
  if (!isJsonRecord(parsed)) {
    throw new Error(`${path} must contain a JSON object.`);
  }
  return parsed;
}

describe("strict tooling policy", () => {
  test("pins every audited static-analysis release", () => {
    const packageJson = readJsonRecord("package.json");
    const devDependencies = packageJson["devDependencies"];
    expect(isJsonRecord(devDependencies)).toBe(true);
    if (!isJsonRecord(devDependencies)) {
      return;
    }

    expect(devDependencies).toMatchObject({
      "@biomejs/biome": "2.5.3",
      "react-doctor": "0.7.8",
      typescript: "7.0.2",
      ultracite: "7.9.4",
    });
  });

  test("enables every Biome lint rule with strict complexity limits", () => {
    const biomeConfig = readFileSync(
      resolve(projectRoot, "biome.jsonc"),
      "utf8"
    );

    expect(biomeConfig).toMatch(allRulesPresetPattern);
    expect(biomeConfig).toMatch(complexityLimitPattern);
    expect(biomeConfig).toMatch(functionLinesLimitPattern);
    expect(biomeConfig).toMatch(parameterLimitPattern);
  });

  test("enables every semantics-preserving Biome assist", () => {
    const biomeConfig = readFileSync(
      resolve(projectRoot, "biome.jsonc"),
      "utf8"
    );

    expect(biomeConfig.match(allAssistsPresetPattern)).toHaveLength(2);
    for (const unsafeAssistPattern of unsafeAssistPatterns) {
      expect(biomeConfig).toMatch(unsafeAssistPattern);
    }
  });

  test("keeps every Biome rule enabled except classified collisions", () => {
    const biomeConfig = readFileSync(
      resolve(projectRoot, "biome.jsonc"),
      "utf8"
    );
    const disabledRules = [
      ...new Set(
        [...biomeConfig.matchAll(disabledBiomeRulePattern)].map(
          ([, ruleName]) => ruleName
        )
      ),
    ].sort();

    expect(disabledRules).toEqual(allowedDisabledBiomeRules);
  });

  test("preserves TanStack Router route code splitting", () => {
    const biomeConfig = readFileSync(
      resolve(projectRoot, "biome.jsonc"),
      "utf8"
    );

    expect(biomeConfig).toMatch(routeFastRefreshOverridePattern);
  });

  test("enables every applicable TypeScript diagnostic", () => {
    for (const path of ["tsconfig.json", "tsconfig.node.json"]) {
      const config = readJsonRecord(path);
      const { compilerOptions } = config;
      expect(isJsonRecord(compilerOptions)).toBe(true);
      if (!isJsonRecord(compilerOptions)) {
        continue;
      }

      expect(compilerOptions).toMatchObject(strictTypeScriptOptions);
      expect(compilerOptions).toMatchObject(generatedCodeCompatibilityOptions);
    }
  });

  test("isolates declarations at the application-to-tooling boundary", () => {
    const declarationConfig = readJsonRecord("tsconfig.declarations.json");
    const { compilerOptions } = declarationConfig;
    expect(isJsonRecord(compilerOptions)).toBe(true);
    if (!isJsonRecord(compilerOptions)) {
      return;
    }

    expect(compilerOptions).toMatchObject({
      composite: true,
      declaration: true,
      emitDeclarationOnly: true,
      isolatedDeclarations: true,
      noEmit: false,
    });
    expect(declarationConfig["include"]).toEqual([
      "scripts/perf-budgets.ts",
      "vitest.browser-policy.ts",
    ]);
  });
});
