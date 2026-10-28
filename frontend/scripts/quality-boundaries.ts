import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { isRecord, isUnknownArray } from "../src/lib/value-guards";

const artifactDirectories = [
  ".git",
  ".cache",
  ".next",
  ".nyc_output",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "opensrc",
  "out",
  "playwright-report",
  "test-results",
];
const generatedScopes = new Set([
  "src/components/ui/**",
  "src/protogen/**",
  "src/routeTree.gen.ts",
]);
const biomeExclusions = new Set([
  ...artifactDirectories.map((directory) => `!!**/${directory}`),
  "!!src/protogen",
  "!!src/components/ui",
  "!src/routeTree.gen.ts",
  "!!**/bun.lock",
  "!!**/bun.lockb",
]);
const toolExclusions = new Set([
  ...artifactDirectories.map((directory) => `${directory}/**`),
  "src/protogen/**",
  "src/components/ui/**",
  "**/*.gen.ts",
  "**/*.gen.tsx",
]);
const disabledEngineRoles = new Set([
  "markdown.linter",
  "markdown.formatter",
  "json.assist",
]);
const engines = ["linter", "formatter", "assist"] as const;
const languages = [
  "javascript",
  "json",
  "css",
  "html",
  "yaml",
  "graphql",
  "markdown",
];
const trueCompilerOptions = [
  "strict",
  "alwaysStrict",
  "exactOptionalPropertyTypes",
  "forceConsistentCasingInFileNames",
  "noEmitOnError",
  "noFallthroughCasesInSwitch",
  "noImplicitAny",
  "noImplicitOverride",
  "noImplicitReturns",
  "noImplicitThis",
  "noPropertyAccessFromIndexSignature",
  "noUncheckedIndexedAccess",
  "noUncheckedSideEffectImports",
  "noUnusedLocals",
  "noUnusedParameters",
  "strictBindCallApply",
  "strictBuiltinIteratorReturn",
  "strictFunctionTypes",
  "strictNullChecks",
  "strictPropertyInitialization",
  "useUnknownInCatchVariables",
  "isolatedModules",
  "verbatimModuleSyntax",
];
const falseCompilerOptions = [
  "allowUnreachableCode",
  "allowUnusedLabels",
  "noCheck",
];
const toolConfigIncludes = ["*.ts", "*.mts", "*.cts", "*.js", "*.mjs", "*.cjs"];
const compilerProjects = [
  {
    name: "tsconfig.json",
    includes: [
      "src",
      "test/setup-globals.ts",
      ...toolConfigIncludes,
      "e2e",
      "scripts",
      "public/**/*.js",
    ],
    excludes: ["opensrc", "src/components/ui"],
    checkJs: true,
  },
  {
    name: "tsconfig.node.json",
    includes: [
      ...toolConfigIncludes,
      "src/import-meta-env.d.ts",
      "package.json",
      "e2e",
      "scripts",
    ],
    excludes: ["src/components/ui"],
    checkJs: true,
  },
  {
    name: "tsconfig.browser-js.json",
    includes: ["public/**/*.js"],
    excludes: [],
    checkJs: true,
  },
  {
    name: "tsconfig.ui.json",
    includes: ["src/components/ui", "src/types/css.d.ts"],
    excludes: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/**/*.spec.ts",
      "src/**/*.spec.tsx",
    ],
    checkJs: false,
  },
  {
    name: "tsconfig.declarations.json",
    includes: ["scripts/perf-budgets.ts", "src/lib/value-guards.ts"],
    excludes: ["src/components/ui"],
    checkJs: false,
  },
];
const recordSchema = z.record(z.string(), z.unknown());
const exceptionSchema = z.object({
  scope: z.array(z.string()).min(1),
  rules: z.array(z.string()).min(1),
});
const boundaryInventorySchema = z.object({
  biome: z.array(z.object({ rule: z.string(), decision: z.string() })),
  oxlint: z.array(z.object({ rule: z.string(), decision: z.string() })),
  overrideExceptions: z.object({
    biome: z.array(exceptionSchema),
    oxlint: z.array(exceptionSchema),
  }),
});
type OverrideException = z.infer<typeof exceptionSchema>;

function ruleSeverity(configured: unknown): unknown {
  const level = isUnknownArray(configured) ? configured[0] : configured;
  return isRecord(level) ? level["level"] : level;
}

function isErrorLevel(configured: unknown): boolean {
  const level = ruleSeverity(configured);
  return level === "error" || level === "deny" || level === 2;
}

function isOffLevel(configured: unknown): boolean {
  const level = ruleSeverity(configured);
  return level === "off" || level === "allow" || level === 0;
}

function recordAt(
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const value = record[key];
  return value === undefined ? {} : recordSchema.parse(value);
}

function strings(value: unknown): string[] {
  return z.array(z.string()).parse(value ?? []);
}

async function loadConfig(
  root: string,
  file: string
): Promise<Record<string, unknown>> {
  const module: unknown = await import(join(root, file));
  return z.object({ default: recordSchema }).parse(module).default;
}

function readConfig(root: string, file: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(join(root, file), "utf8"));
  return recordSchema.parse(parsed);
}

function assertExclusions(
  tool: string,
  values: readonly string[],
  approved: ReadonlySet<string>
): void {
  for (const value of values) {
    if (!approved.has(value)) {
      throw new Error(`Unreviewed ${tool} exclusion: ${value}`);
    }
  }
}

function assertEngineSwitches(
  config: Record<string, unknown>,
  prefix = "",
  generated = false
): void {
  for (const engine of engines) {
    assertEngine(recordAt(config, engine), prefix + engine, generated);
  }
  for (const language of languages) {
    if (config[language] !== undefined) {
      assertEngineSwitches(
        recordAt(config, language),
        `${prefix}${language}.`,
        generated
      );
    }
  }
}

function assertEngine(
  settings: Record<string, unknown>,
  role: string,
  generated: boolean
): void {
  if (
    settings["enabled"] === false &&
    !generated &&
    !disabledEngineRoles.has(role)
  ) {
    throw new Error(`Quality engine cannot be disabled: ${role}`);
  }
  if (settings["includes"] !== undefined) {
    const includes = strings(settings["includes"]);
    if (includes.length !== 1 || includes[0] !== "**") {
      throw new Error(`Quality engine cannot narrow coverage: ${role}`);
    }
  }
}

function reviewedException(
  scope: readonly string[],
  rule: string,
  exceptions: readonly OverrideException[]
): boolean {
  const key = JSON.stringify(scope.toSorted());
  return exceptions.some(
    (exception) =>
      JSON.stringify(exception.scope.toSorted()) === key &&
      exception.rules.includes(rule)
  );
}

function assertOverrideLevel({
  tool,
  scope,
  rule,
  value,
  policies,
  exceptions,
}: {
  tool: string;
  scope: readonly string[];
  rule: string;
  value: unknown;
  policies: ReadonlyMap<string, string>;
  exceptions: readonly OverrideException[];
}): void {
  const decision = policies.get(rule);
  const errorExpected = decision === "error" || decision === "scoped-error";
  if (
    (errorExpected && isErrorLevel(value)) ||
    (!errorExpected && decision !== undefined && isOffLevel(value))
  ) {
    return;
  }
  if (isOffLevel(value) && reviewedException(scope, rule, exceptions)) {
    return;
  }
  throw new Error(
    `Unreviewed ${tool} override: ${scope.join(", ")} -> ${rule}`
  );
}

function biomeRuleEntries(
  groups: Record<string, unknown>
): { rule: string; value: unknown }[] {
  return Object.entries(groups).flatMap(([group, rules]) =>
    Object.entries(recordSchema.parse(rules)).flatMap(([name, value]) =>
      name === "preset" || name === "recommended"
        ? []
        : [{ rule: `${group}/${name}`, value }]
    )
  );
}

function assertBiomeOverrides(
  config: Record<string, unknown>,
  policies: ReadonlyMap<string, string>,
  exceptions: readonly OverrideException[]
): void {
  const overrides = z.array(recordSchema).parse(config["overrides"] ?? []);
  for (const override of overrides) {
    const scope = strings(override["includes"]);
    const generated =
      scope.length > 0 && scope.every((path) => generatedScopes.has(path));
    assertEngineSwitches(override, "", generated);
    for (const { rule, value } of biomeRuleEntries(
      recordAt(recordAt(override, "linter"), "rules")
    )) {
      assertOverrideLevel({
        tool: "Biome",
        scope,
        rule,
        value,
        policies,
        exceptions,
      });
    }
  }
}

function assertBiome(
  config: Record<string, unknown>,
  policies: ReadonlyMap<string, string>,
  exceptions: readonly OverrideException[]
): void {
  const presets = strings(config["extends"]);
  if (presets.length !== 1 || presets[0] !== "ultracite/biome/playwright") {
    throw new Error("Unreviewed Biome preset inheritance");
  }
  const includes = strings(recordAt(config, "files")["includes"]);
  if (!includes.includes("**")) {
    throw new Error("Biome must cover all authored file roles");
  }
  assertExclusions(
    "Biome",
    includes.filter((pattern) => pattern !== "**"),
    biomeExclusions
  );
  if (recordAt(config, "vcs")["useIgnoreFile"] !== false) {
    throw new Error("Biome must not inherit source exclusions from gitignore");
  }
  assertEngineSwitches(config);
  assertBiomeOverrides(config, policies, exceptions);
}

function assertOxlint(
  config: Record<string, unknown>,
  policies: ReadonlyMap<string, string>,
  exceptions: readonly OverrideException[]
): void {
  if (strings(config["extends"]).length > 0) {
    throw new Error(
      "Oxlint presets must remain materialized without inherited overrides"
    );
  }
  const options = recordAt(config, "options");
  if (
    options["typeAware"] !== true ||
    options["maxWarnings"] !== 0 ||
    options["respectEslintDisableDirectives"] !== false
  ) {
    throw new Error("Oxlint must retain type-aware fatal checks");
  }
  assertExclusions("Oxlint", strings(config["ignorePatterns"]), toolExclusions);
  for (const override of z
    .array(recordSchema)
    .parse(config["overrides"] ?? [])) {
    assertOxlintOverride(override, policies, exceptions);
  }
}

function assertOxlintOverride(
  override: Record<string, unknown>,
  policies: ReadonlyMap<string, string>,
  exceptions: readonly OverrideException[]
): void {
  if (Object.keys(override).some((key) => key !== "files" && key !== "rules")) {
    throw new Error(
      "Oxlint overrides cannot alter engine or coverage settings"
    );
  }
  const scope = strings(override["files"]);
  for (const [name, value] of Object.entries(recordAt(override, "rules"))) {
    const rule = name.includes("/") ? name : `eslint/${name}`;
    assertOverrideLevel({
      tool: "Oxlint",
      scope,
      rule,
      value,
      policies,
      exceptions,
    });
  }
}

function assertDoctor(config: Record<string, unknown>): void {
  if (
    config["lint"] !== true ||
    config["warnings"] !== true ||
    config["scope"] !== "full" ||
    config["blocking"] !== "warning" ||
    config["respectInlineDisables"] !== false
  ) {
    throw new Error("Doctor must retain full fatal analysis");
  }
  const approved = new Set([...toolExclusions, ".rstest/**"]);
  assertExclusions(
    "Doctor",
    strings(recordAt(config, "ignore")["files"]),
    approved
  );
}

function assertCompilerCoverage(
  project: (typeof compilerProjects)[number],
  config: Record<string, unknown>
): void {
  const includes = new Set(strings(config["include"]));
  const approved = new Set(project.excludes);
  if (
    !project.includes.every((pattern) => includes.has(pattern)) ||
    strings(config["exclude"]).some((pattern) => !approved.has(pattern))
  ) {
    throw new Error(`Compiler coverage is not enforced: ${project.name}`);
  }
}

function assertCompiler(
  root: string,
  project: (typeof compilerProjects)[number]
): void {
  const result = spawnSync(
    join(root, "node_modules/.bin/tsc"),
    ["-p", join(root, project.name), "--showConfig"],
    { cwd: root, encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(
      `Cannot inspect compiler project ${project.name}: ${result.stdout}${result.stderr}`
    );
  }
  const parsed: unknown = JSON.parse(result.stdout);
  const resolved = recordSchema.parse(parsed);
  assertCompilerCoverage(project, resolved);
  const options = recordAt(resolved, "compilerOptions");
  const requiredTrue = project.checkJs
    ? [...trueCompilerOptions, "checkJs"]
    : trueCompilerOptions;
  for (const option of requiredTrue) {
    if (options[option] !== true) {
      throw new Error(
        `Compiler contract is not enforced: ${project.name}/${option}`
      );
    }
  }
  for (const option of falseCompilerOptions) {
    if (options[option] !== false) {
      throw new Error(
        `Compiler contract is not enforced: ${project.name}/${option}`
      );
    }
  }
}

async function assertQualityBoundaries(
  root: string
): Promise<ReadonlySet<string>> {
  const inventory = boundaryInventorySchema.parse(
    readConfig(root, "quality/rule-inventory.json")
  );
  const [biome, oxlint, doctor] = await Promise.all([
    loadConfig(root, "biome.jsonc"),
    loadConfig(root, "oxlint.config.ts"),
    loadConfig(root, "doctor.config.ts"),
  ]);
  assertBiome(
    biome,
    new Map(inventory.biome.map((entry) => [entry.rule, entry.decision])),
    inventory.overrideExceptions.biome
  );
  assertOxlint(
    oxlint,
    new Map(inventory.oxlint.map((entry) => [entry.rule, entry.decision])),
    inventory.overrideExceptions.oxlint
  );
  assertDoctor(doctor);
  for (const project of compilerProjects) {
    assertCompiler(root, project);
  }
  return new Set(trueCompilerOptions);
}

export { assertQualityBoundaries, ruleSeverity };
