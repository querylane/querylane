import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "@rstest/core";
import { z } from "zod";

const root = resolve(import.meta.dirname, "..");
const compilers = ["tsrs", "tsc"];
const DEBUGGER_RULE_PATTERN = /noDebugger|no-debugger/u;
const NODE_VERSION_PATTERN =
  /^ {2}NODE_VERSION: &node_version (?<version>\S+)$/mu;

test("development and CI use Node 26 LTS with the same advertised minimum", () => {
  const version = readFileSync(join(root, "../.node-version"), "utf8").trim();
  expect(version).toBe("26.13.0");

  const manifest = z
    .object({ engines: z.object({ node: z.string() }) })
    .parse(JSON.parse(readFileSync(join(root, "package.json"), "utf8")));
  expect(manifest.engines.node).toBe(`>=${version}`);

  for (const workflow of ["frontend-ci.yml", "release.yml"]) {
    const source = readFileSync(
      join(root, "../.github/workflows", workflow),
      "utf8"
    );
    expect(NODE_VERSION_PATTERN.exec(source)?.groups?.["version"]).toBe(
      version
    );
  }
});

function lintBiome(file: string) {
  return spawnSync(
    join(root, "node_modules/.bin/biome"),
    ["lint", "--error-on-warnings", file],
    {
      cwd: root,
      encoding: "utf8",
    }
  );
}

test("default imports require a default export", () => {
  const directory = mkdtempSync(join(root, "scripts/quality-probe-"));
  const file = join(directory, "consumer.ts");
  const lint = () => lintBiome(file);
  try {
    writeFileSync(
      join(directory, "source.ts"),
      'export function read() { return "ready"; }\n'
    );
    writeFileSync(
      file,
      'import read from "./source"; export const value = read();\n'
    );
    const invalid = lint();
    expect(invalid.status).toBe(1);
    expect(invalid.stdout + invalid.stderr).toContain(
      "noUnresolvedDefaultImport"
    );
    writeFileSync(
      file,
      'import { read } from "./source"; export const value = read();\n'
    );
    const valid = lint();
    expect(valid.status, valid.stdout + valid.stderr).toBe(0);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("rejects oversized authored files instead of passing a skipped scan", () => {
  const directory = mkdtempSync(join(root, "scripts/quality-probe-"));
  const file = join(directory, "oversized.ts");
  try {
    writeFileSync(join(directory, "valid.ts"), "export const ready = true;\n");
    writeFileSync(file, `//${" ".repeat(1_048_576)}\n`);
    const result = spawnSync(
      join(root, "node_modules/.bin/biome"),
      ["lint", "--error-on-warnings", directory],
      {
        cwd: root,
        encoding: "utf8",
      }
    );
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain(
      "exceeds the configured maximum"
    );
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test.each([
  {
    name: "named iterable selection",
    rule: "noUnreadableForOfExpression",
    suffix: "unit.test.ts",
    invalid:
      "export function count(values: readonly string[] | undefined) { let total = 0; for (const value of values ?? []) { total += value.length; } return total; }\n",
    valid:
      "export function count(values: readonly string[] | undefined) { const items = values ?? []; let total = 0; for (const value of items) { total += value.length; } return total; }\n",
  },
  {
    name: "synchronous promise finalizers",
    rule: "noAsyncPromiseFinally",
    suffix: "unit.test.ts",
    invalid:
      "export function finish(promise: Promise<void>, cleanup: () => Promise<void>) { return promise.finally(async () => { await cleanup(); }); }\n",
    valid:
      "export function finish(promise: Promise<void>, cleanup: () => void) { return promise.finally(cleanup); }\n",
  },
  {
    name: "unique type constituents",
    rule: "noDuplicateTypeConstituents",
    suffix: "unit.test.ts",
    invalid: "export type Value = string | number | string;\n",
    valid: "export type Value = string | number;\n",
  },
  {
    name: "bounded selector complexity",
    rule: "noExcessiveSelectorComplexity",
    suffix: "css",
    invalid: "#main #sidebar { color: inherit; }\n",
    valid: "#main .sidebar { color: inherit; }\n",
  },
  {
    name: "body-compatible fetch methods",
    rule: "noInvalidFetchOptions",
    suffix: "unit.test.ts",
    invalid:
      'export function send() { return fetch("/", { method: "GET", body: "payload" }); }\n',
    valid:
      'export function send() { return fetch("/", { method: "POST", body: "payload" }); }\n',
  },
  {
    name: "unambiguous array construction",
    rule: "noNewArray",
    suffix: "unit.test.ts",
    invalid:
      "export function allocate(length: number) { return new Array(length); }\n",
    valid:
      "export function allocate(length: number) { return Array.from({ length }); }\n",
  },
  {
    name: "effective type constituents",
    rule: "noRedundantTypeConstituents",
    suffix: "unit.test.ts",
    invalid: 'export type Value = string | "ready";\n',
    valid: 'export type Value = "ready" | "waiting";\n',
  },
  {
    name: "direct object spreads",
    rule: "noUselessFallbackInSpread",
    suffix: "unit.test.ts",
    invalid:
      "export function copy(value: { name: string } | undefined) { return { ...(value ?? {}) }; }\n",
    valid:
      "export function copy(value: { name: string } | undefined) { return { ...value }; }\n",
  },
  {
    name: "effective iterable spreads",
    rule: "noUselessSpread",
    suffix: "unit.test.ts",
    invalid:
      "export function unique(values: readonly string[]) { return new Set([...values]); }\n",
    valid:
      "export function unique(values: readonly string[]) { return new Set(values); }\n",
  },
  {
    name: "descriptive caught errors",
    rule: "useCatchErrorName",
    suffix: "unit.test.ts",
    invalid:
      "export function recover(promise: Promise<string>) { return promise.catch((err: unknown) => String(err)); }\n",
    valid:
      "export function recover(promise: Promise<string>) { return promise.catch((error: unknown) => String(error)); }\n",
  },
  {
    name: "numeric font weights",
    rule: "useConsistentFontWeightNotation",
    suffix: "css",
    invalid: "a { font-weight: bold; }\n",
    valid: "a { font-weight: 700; }\n",
  },
  {
    name: "consistent tuple labels",
    rule: "useConsistentTupleLabels",
    suffix: "unit.test.ts",
    invalid: "export type Point = [x: number, number];\n",
    valid: "export type Point = [x: number, y: number];\n",
  },
  {
    name: "global match-all patterns",
    rule: "useGlobalRegexInMatchAll",
    suffix: "unit.test.ts",
    invalid:
      "const pattern = /item/u; export function matches(value: string) { return value.matchAll(pattern); }\n",
    valid:
      "const pattern = /item/gu; export function matches(value: string) { return value.matchAll(pattern); }\n",
  },
  {
    name: "global replace-all patterns",
    rule: "useGlobalRegexInReplaceAll",
    suffix: "unit.test.ts",
    invalid:
      'const pattern = /item/u; export function replace(value: string) { return value.replaceAll(pattern, "value"); }\n',
    valid:
      'const pattern = /item/gu; export function replace(value: string) { return value.replaceAll(pattern, "value"); }\n',
  },
  {
    name: "single-character comparisons",
    rule: "useValidCharacterComparison",
    suffix: "unit.test.ts",
    invalid:
      'export function starts(value: string) { return value.charAt(0) === "ab"; }\n',
    valid:
      'export function starts(value: string) { return value.startsWith("a"); }\n',
  },
  {
    name: "browser runtime globals",
    rule: "noRestrictedGlobals",
    directory: "src",
    suffix: "ts",
    invalid:
      "export function encode(value: string) { return Buffer.from(value); }\n",
    valid:
      "export function encode(value: string) { return new TextEncoder().encode(value); }\n",
  },
  {
    name: "custom input autocomplete tokens",
    rule: "useValidAutocomplete",
    suffix: "tsx",
    invalid:
      'import { Input } from "@/components/ui/input"; export const field = <Input aria-label="Name" autoComplete="full-name" />;\n',
    valid:
      'import { Input } from "@/components/ui/input"; export const field = <Input aria-label="Name" autoComplete="name" />;\n',
  },
  {
    name: "bounded CSS selector classes",
    rule: "noExcessiveSelectorClasses",
    suffix: "css",
    invalid: ".one.two.three.four.five.six { color: inherit; }\n",
    valid: ".one.two.three.four.five { color: inherit; }\n",
  },
  {
    name: "safe Tailwind shorthand classes",
    rule: "useTailwindShorthandClasses",
    suffix: "tsx",
    invalid: 'export const icon = <span className="h-4 w-4 divide-y" />;\n',
    valid: 'export const icon = <span className="size-4 divide-y" />;\n',
  },
  {
    name: "array-compatible arguments",
    rule: "noArrayMethodsOnArguments",
    suffix: "unit.test.ts",
    invalid:
      "export function collect() { return arguments.map((value: string) => value.trim()); }\n",
    valid:
      "export function collect(...values: string[]) { return values.map((value) => value.trim()); }\n",
  },
  {
    name: "non-erasing arithmetic",
    rule: "noErasingOperation",
    suffix: "unit.test.ts",
    invalid: "export function total(value: number) { return value * 0; }\n",
    valid: "export function total(value: number) { return value * 2; }\n",
  },
  {
    name: "direct array predicates",
    rule: "noNegatedArrayPredicate",
    suffix: "unit.test.ts",
    invalid:
      "export function empty(values: readonly string[]) { return !values.some((value) => value.length > 0); }\n",
    valid:
      "export function empty(values: readonly string[]) { return values.every((value) => value.length === 0); }\n",
  },
  {
    name: "in-range numeric formatting",
    rule: "noNumberArgumentOutOfRange",
    suffix: "unit.test.ts",
    invalid:
      "export function format(value: number) { return value.toString(64); }\n",
    valid:
      "export function format(value: number) { return value.toString(16); }\n",
  },
  {
    name: "shared branch cleanup",
    rule: "noSharedBranchCode",
    suffix: "unit.test.ts",
    invalid:
      'export function save(value: boolean) { if (value) { console.error("yes"); console.error("done"); } else { console.error("no"); console.error("done"); } }\n',
    valid:
      'export function save(value: boolean) { if (value) { console.error("yes"); } else { console.error("no"); } console.error("done"); }\n',
  },
  {
    name: "direct operand comparisons",
    rule: "noSubtractionComparison",
    suffix: "unit.test.ts",
    invalid:
      "export function greater(a: number, b: number) { return a - b > 0; }\n",
    valid: "export function greater(a: number, b: number) { return a > b; }\n",
  },
  {
    name: "initialized array callbacks",
    rule: "noUninvokedArrayCallback",
    suffix: "unit.test.ts",
    invalid: 'export const values = new Array(5).map(() => "item");\n',
    valid: 'export const values = Array.from({ length: 5 }, () => "item");\n',
  },
  {
    name: "declared runtime engines without CPU restrictions",
    rule: "usePackageJsonEngines",
    suffix: "json",
    invalid:
      '{"name":"quality-probe","private":true,"packageManager":"bun@1.4.4","scripts":{"lint":"biome check .","lint:fix":"biome check --write .","quality:gate":"bun run lint && bun run type:check && bun run build && bun run test","type:check":"tsc --noEmit","build":"rsbuild build","test":"rstest"}}\n',
    valid:
      '{"name":"quality-probe","private":true,"packageManager":"bun@1.4.4","scripts":{"lint":"biome check .","lint:fix":"biome check --write .","quality:gate":"bun run lint && bun run type:check && bun run build && bun run test","type:check":"tsc --noEmit","build":"rsbuild build","test":"rstest"},"engines":{"node":">=26.13.0"}}\n',
  },
  {
    name: "possible numeric ranges",
    rule: "noConstantComparisons",
    suffix: "unit.test.ts",
    invalid:
      "export function valid(value: number) { return value <= 400 && value > 500; }\n",
    valid:
      "export function valid(value: number) { return value >= 400 && value <= 500; }\n",
  },
  {
    name: "unchained numeric comparisons",
    rule: "noChainedComparison",
    suffix: "unit.test.ts",
    invalid:
      "export function between(a: number, b: number, c: number) { return a < b < c; }\n",
    valid:
      "export function between(a: number, b: number, c: number) { return a < b && b < c; }\n",
  },
  {
    name: "concurrent promise batches",
    rule: "noAwaitInPromiseMethods",
    suffix: "unit.test.ts",
    invalid:
      "export async function load(first: Promise<string>, second: Promise<string>) { return Promise.all([await first, second]); }\n",
    valid:
      "export async function load(first: Promise<string>, second: Promise<string>) { return Promise.all([first, second]); }\n",
  },
  {
    name: "matching event listener identities",
    rule: "noInvalidRemoveEventListener",
    suffix: "unit.test.ts",
    invalid:
      'export function detach(target: EventTarget) { target.removeEventListener("click", () => {}); }\n',
    valid:
      'export function detach(target: EventTarget, listener: EventListener) { target.removeEventListener("click", listener); }\n',
  },
  {
    name: "synchronous event cancellation",
    rule: "noLateEventControl",
    suffix: "unit.test.ts",
    invalid:
      'document.addEventListener("click", async (event) => { await Promise.resolve(); event.preventDefault(); });\n',
    valid:
      'document.addEventListener("click", async (event) => { event.preventDefault(); await Promise.resolve(); });\n',
  },
  {
    name: "consistent map lookup keys",
    rule: "noMismatchedMapKey",
    suffix: "unit.test.ts",
    invalid:
      "export function lookup(values: Map<string, string>, key: string, other: string) { if (values.has(key)) { return values.get(other); } return undefined; }\n",
    valid:
      "export function lookup(values: Map<string, string>, key: string) { if (values.has(key)) { return values.get(key); } return undefined; }\n",
  },
  {
    name: "thrown validation errors",
    rule: "noMissingThrow",
    suffix: "unit.test.ts",
    invalid:
      'export function validate(value: boolean) { if (!value) { new Error("Missing value"); } }\n',
    valid:
      'export function validate(value: boolean) { if (!value) { throw new Error("Missing value"); } }\n',
  },
  {
    name: "reference-safe emptiness checks",
    rule: "noObjectLiteralComparison",
    suffix: "unit.test.ts",
    invalid:
      "export function empty(value: string[]) { return value === []; }\n",
    valid:
      "export function empty(value: string[]) { return value.length === 0; }\n",
  },
  {
    name: "Playwright browser isolation",
    rule: "noPlaywrightUnsafeReferences",
    suffix: "spec.ts",
    invalid:
      'const label = "ready"; test("reads the page", async ({ page }) => { const result = await page.evaluate(() => label); expect(result).toBe(label); });\n',
    valid:
      'const label = "ready"; test("reads the page", async ({ page }) => { const result = await page.evaluate((value) => value, label); expect(result).toBe(label); });\n',
  },
  {
    name: "TanStack query return values",
    rule: "noTanstackQueryVoidQueryFn",
    suffix: "unit.test.ts",
    invalid:
      'import { useQuery } from "@tanstack/react-query"; export function useItems() { return useQuery({ queryKey: ["items"], queryFn: async () => { await Promise.resolve("ready"); } }); }\n',
    valid:
      'import { useQuery } from "@tanstack/react-query"; export function useItems() { return useQuery({ queryKey: ["items"], queryFn: async () => Promise.resolve("ready") }); }\n',
  },
  {
    name: "stable query clients",
    rule: "useTanstackQueryStableQueryClient",
    suffix: "tsx",
    invalid:
      'import { QueryClient, QueryClientProvider } from "@tanstack/react-query"; export function Provider() { const client = new QueryClient(); return <QueryClientProvider client={client} />; }\n',
    valid:
      'import { QueryClient, QueryClientProvider } from "@tanstack/react-query"; const client = new QueryClient(); export function Provider() { return <QueryClientProvider client={client} />; }\n',
  },
  {
    name: "direct set sizes",
    rule: "useSetSize",
    suffix: "unit.test.ts",
    invalid:
      "export function size(values: Set<string>) { return [...values].length; }\n",
    valid:
      "export function size(values: Set<string>) { return values.size; }\n",
  },
  {
    name: "console argument spacing",
    rule: "noConsoleSpaces",
    suffix: "unit.test.ts",
    invalid: 'console.error("message ", "details");\n',
    valid: 'console.error("message", "details");\n',
  },
  {
    name: "documented array flattening depth",
    rule: "noMagicArrayFlatDepth",
    suffix: "unit.test.ts",
    invalid: 'export const values = [[["a"]]].flat(2);\n',
    valid:
      'export const values = [[["a"]]].flat(/* Remove both nested list layers. */ 2);\n',
  },
  {
    name: "array mutation return values",
    rule: "noReturnArrayPush",
    suffix: "unit.test.ts",
    invalid:
      "export function append(items: string[], item: string): number { return items.push(item); }\n",
    valid:
      "export function append(items: string[], item: string): void { items.push(item); }\n",
  },
  {
    name: "readable immediate evaluation",
    rule: "noUnreadableIife",
    suffix: "unit.test.ts",
    invalid:
      'export const label = ((value: boolean) => (value ? "yes" : "no"))(true);\n',
    valid:
      'function label(value: boolean): string { return value ? "yes" : "no"; }\nexport const result = label(true);\n',
  },
  {
    name: "bounded stack use",
    rule: "noUselessRecursion",
    suffix: "unit.test.ts",
    invalid:
      "export function countdown(value: number): number { if (value <= 0) { return value; } return countdown(value - 1); }\n",
    valid:
      "export function countdown(value: number): number { let remaining = value; while (remaining > 0) { remaining -= 1; } return remaining; }\n",
  },
  {
    name: "explicit loop conditions",
    rule: "useWhileLoopCondition",
    suffix: "unit.test.ts",
    invalid:
      "export function count(values: readonly string[]): number { let total = 0; while (true) { if (total >= values.length) { break; } total += 1; } return total; }\n",
    valid:
      "export function count(values: readonly string[]): number { let total = 0; while (total < values.length) { total += 1; } return total; }\n",
  },
  {
    name: "textual YAML keys",
    rule: "noYamlBooleanKeys",
    suffix: "yaml",
    invalid: "true: enabled\n",
    valid: '"true": enabled\n',
  },
])("biome enforces $name without rejecting valid alternatives", (probe) => {
  const directory = mkdtempSync(
    join(root, probe.directory ?? "scripts", "quality-probe-")
  );
  const file = join(
    directory,
    probe.suffix === "json" ? "package.json" : `probe.${probe.suffix}`
  );
  const lint = () => lintBiome(file);
  try {
    writeFileSync(file, probe.invalid);
    const invalid = lint();
    expect(invalid.status).toBe(1);
    expect(invalid.stdout + invalid.stderr).toContain(probe.rule);
    writeFileSync(file, probe.valid);
    const valid = lint();
    expect(valid.status, valid.stdout + valid.stderr).toBe(0);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test.each([
  {
    name: "readonly inputs",
    rule: "typescript(prefer-readonly-parameter-types)",
    source:
      "export function count(values: string[]): number { return values.length; }\n",
  },
  {
    name: "explicit exported contracts",
    rule: "typescript(explicit-module-boundary-types)",
    source:
      "export function count(values: readonly string[]) { return values.length; }\n",
  },
  {
    name: "impossible conditions",
    rule: "typescript(no-unnecessary-condition)",
    source:
      "export function missing(values: readonly string[]): boolean { return values === undefined; }\n",
  },
  {
    name: "stateful alias imports",
    rule: "eslint(no-restricted-imports)",
    source:
      'import { logger } from "@/lib/diagnostics";\n\nexport function count(values: readonly string[]): number { logger.info("count", values.length); return values.length; }\n',
  },
  {
    name: "relative escapes into platform adapters",
    rule: "eslint(no-restricted-imports)",
    source:
      'import { logger } from "../../diagnostics";\n\nexport function count(values: readonly string[]): number { logger.info("count", values.length); return values.length; }\n',
  },
  {
    name: "React hooks in value transformations",
    rule: "eslint(no-restricted-imports)",
    source:
      'import { useId } from "react";\n\nexport function useDomainId(): string { return useId(); }\n',
  },
  {
    name: "ambient browser state",
    rule: "eslint(no-restricted-globals)",
    source:
      "export function language(): string { return navigator.language; }\n",
  },
  {
    name: "qualified browser state",
    rule: "eslint(no-restricted-globals)",
    source:
      "export function language(): string { return globalThis.navigator.language; }\n",
  },
  {
    name: "browser state through a namespace alias",
    rule: "eslint(no-restricted-globals)",
    source:
      "export function language(): string { const platform = globalThis; return platform.navigator.language; }\n",
  },
  {
    name: "erased adapter type imports",
    rule: null,
    source:
      'import type { DiagnosticLogger } from "@/lib/diagnostics";\n\nexport type LogSink = Readonly<DiagnosticLogger>;\n',
  },
  {
    name: "shared value guards",
    rule: null,
    source:
      'import { isNonEmptyString } from "@/lib/value-guards";\n\nexport function hasText(value: string | undefined): boolean { return isNonEmptyString(value); }\n',
  },
  {
    name: "valid pure transformation",
    rule: null,
    source:
      "export function count(values: readonly string[]): number { return values.length; }\n",
  },
])("pure domain lint enforces $name", ({ rule, source }) => {
  const domain = join(root, "src/lib/domain");
  mkdirSync(domain, { recursive: true });
  const directory = mkdtempSync(join(domain, "quality-probe-"));
  const file = join(directory, "probe.ts");
  try {
    writeFileSync(file, source);
    const result = spawnSync(
      join(root, "node_modules/.bin/oxlint"),
      [
        "--config",
        "oxlint.config.ts",
        "--type-aware",
        "--deny-warnings",
        "--format=json",
        file,
      ],
      { cwd: root, encoding: "utf8" }
    );
    expect(result.status).toBe(rule === null ? 0 : 1);
    const { diagnostics } = z
      .object({ diagnostics: z.array(z.object({ code: z.string() })) })
      .parse(JSON.parse(result.stdout));
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      rule === null ? [] : [rule]
    );
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("platform adapters retain capability guards and mutable resource contracts", () => {
  const directory = mkdtempSync(join(root, "src", "quality-probe-"));
  const file = join(directory, "probe.ts");
  try {
    writeFileSync(
      file,
      "export function cancel(controller: AbortController): void { controller.abort(); }\nexport function report(error: unknown): void { globalThis.reportError?.(error); }\n"
    );
    const result = spawnSync(
      join(root, "node_modules/.bin/oxlint"),
      ["--config", "oxlint.config.ts", "--type-aware", "--deny-warnings", file],
      { cwd: root, encoding: "utf8" }
    );
    expect(result.status).toBe(0);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("domain formatter and typed fixes converge without contradictory rewrites", () => {
  const directory = mkdtempSync(join(root, "src/lib/domain", "quality-probe-"));
  const file = join(directory, "probe.ts");
  const formatted =
    "export function count(values: readonly string[]): number {\n  return values.length;\n}\n";
  try {
    writeFileSync(
      file,
      "export function count(values:readonly string[]):number{return values.length;}\n"
    );
    const passes = Array.from({ length: 2 }, () => {
      const biome = spawnSync(
        join(root, "node_modules/.bin/biome"),
        ["check", "--write", file],
        { cwd: root, encoding: "utf8" }
      );
      const oxlint = spawnSync(
        join(root, "node_modules/.bin/oxlint"),
        [
          "--config",
          "oxlint.config.ts",
          "--type-aware",
          "--deny-warnings",
          "--fix",
          file,
        ],
        { cwd: root, encoding: "utf8" }
      );
      return {
        biome: biome.status,
        oxlint: oxlint.status,
        source: readFileSync(file, "utf8"),
      };
    });
    expect(passes).toEqual([
      { biome: 0, oxlint: 0, source: formatted },
      { biome: 0, oxlint: 0, source: formatted },
    ]);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test.each([
  {
    name: "render-time component factory",
    suffix: "tsx",
    rule: "noComponentHookFactories",
    source:
      "export function Parent() { function Child() { return <div />; } return <Child />; }\n",
  },
  {
    name: "module-level components",
    suffix: "tsx",
    rule: null,
    source:
      "function Child() { return <div />; }\nexport function Parent() { return <Child />; }\n",
  },
  {
    name: "explicit known cases with an unknown-value fallback",
    suffix: "ts",
    rule: null,
    source:
      'export function label(value: "ready" | "missing") { switch (value) { case "ready": return "Ready"; case "missing": default: return "Unknown"; } }\n',
  },
  {
    name: "native disabled form contracts",
    suffix: "tsx",
    rule: null,
    source:
      "export const field = <fieldset disabled={true}><legend>Pending</legend></fieldset>;\n",
  },
  {
    name: "component callback boolean vocabulary",
    suffix: "ts",
    rule: null,
    source:
      "export function isDisabled(disabled: boolean) { return disabled; }\n",
  },
  {
    name: "independent async lifecycle writes",
    suffix: "ts",
    rule: null,
    source:
      'const resource: { current: string | null } = { current: "ready" }; export async function clearResource(work: () => Promise<void>) { if (resource.current) { await work(); } resource.current = null; }\n',
  },
  {
    name: "explicit nullable platform contracts",
    suffix: "ts",
    rule: null,
    source: "export function absent(): string | null { return null; }\n",
  },
  {
    name: "missing Playwright await",
    suffix: "spec.ts",
    rule: "noPlaywrightMissingAwait",
    source:
      'test("shows content", ({ page }) => { expect(page.getByRole("heading")).toBeVisible(); });\n',
  },
  {
    name: "brittle Playwright timeout",
    suffix: "spec.ts",
    rule: "noPlaywrightWaitForTimeout",
    source:
      'test("shows content", async ({ page }) => { await page.waitForTimeout(1000); await expect(page.getByRole("heading")).toBeVisible(); });\n',
  },
  {
    name: "empty Playwright fixture pattern",
    suffix: "spec.ts",
    rule: "noEmptyPattern",
    source:
      'test("reads the browser", ({}) => { expect(globalThis).toBeDefined(); });\n',
  },
  {
    name: "condition-based Playwright assertion",
    suffix: "spec.ts",
    rule: null,
    source:
      'test("shows content", async ({ page }) => { await expect(page.getByRole("heading")).toBeVisible(); });\n',
  },
])("biome checks $name", ({ rule, source, suffix }) => {
  const directory = mkdtempSync(join(root, "src", "quality-probe-"));
  const file = join(directory, `probe.${suffix}`);
  try {
    writeFileSync(file, source);
    const result = spawnSync(
      join(root, "node_modules/.bin/biome"),
      ["lint", "--error-on-warnings", file],
      { cwd: root, encoding: "utf8" }
    );
    expect(result.status, result.stdout + result.stderr).toBe(
      rule === null ? 0 : 1
    );
    expect(result.stdout + result.stderr).toContain(rule ?? "Checked 1 file");
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test.each([
  { input: "", fixesEditedFile: false },
  { input: "not JSON", fixesEditedFile: false },
  { input: "{}", fixesEditedFile: false },
  { input: '{"tool_input":{}}', fixesEditedFile: false },
  { input: '{"tool_input":{"file_path":""}}', fixesEditedFile: false },
  { input: '{"tool_input":{"file_path":42}}', fixesEditedFile: false },
  { input: '{"tool_input":{"file_path":"."}}', fixesEditedFile: false },
  {
    input: '{"tool_input":{"file_path":"missing.ts"}}',
    fixesEditedFile: false,
  },
  {
    input: '{"tool_input":{"file_path":"escaped.ts"}}',
    fixesEditedFile: false,
  },
  {
    input: '{"tool_name":"bash","tool_input":{"file_path":"edited.ts"}}',
    fixesEditedFile: false,
  },
  {
    input: '{"tool_input":{"file_path":"edited.ts"}}',
    fixesEditedFile: true,
  },
  {
    input: JSON.stringify({
      tool_name: "apply_patch",
      tool_input: {
        patch: "*** Begin Patch\n*** Update File: edited.ts\n@@\n*** End Patch",
      },
    }),
    fixesEditedFile: true,
  },
])(
  "agent hook fixes only its named file: $input",
  ({ input, fixesEditedFile }) => {
    const directory = mkdtempSync(join(tmpdir(), "querylane-hook-"));
    const outside = mkdtempSync(join(tmpdir(), "querylane-hook-outside-"));
    const escapedSource = join(outside, "external.ts");
    const source = join(directory, "untouched.ts");
    const original = 'export const value={key:"value"};\n';
    try {
      symlinkSync(join(root, "node_modules"), join(directory, "node_modules"));
      writeFileSync(
        join(directory, "package.json"),
        JSON.stringify({ devDependencies: { "@biomejs/biome": "*" } })
      );
      writeFileSync(join(directory, "biome.json"), '{"root":true}');
      writeFileSync(source, original);
      writeFileSync(escapedSource, original);
      symlinkSync(escapedSource, join(directory, "escaped.ts"));
      const editedSource = join(directory, "edited.ts");
      writeFileSync(editedSource, original);
      const result = spawnSync(
        join(root, "node_modules/.bin/ultracite"),
        ["fix", "--hook"],
        { cwd: directory, encoding: "utf8", input }
      );
      expect(result.status).toBe(0);
      expect(readFileSync(source, "utf8")).toBe(original);
      expect(readFileSync(escapedSource, "utf8")).toBe(original);
      expect(readFileSync(editedSource, "utf8")).toBe(
        fixesEditedFile ? 'export const value = { key: "value" };\n' : original
      );
    } finally {
      rmSync(directory, { recursive: true });
      rmSync(outside, { recursive: true });
    }
  }
);

test("tailwind shorthand fixes preserve vertical dividers", () => {
  const directory = mkdtempSync(join(root, "scripts", "quality-probe-"));
  const file = join(directory, "probe.tsx");
  const source = 'export const rows = <div className="divide-y" />;\n';
  try {
    writeFileSync(file, source);
    const result = spawnSync(
      join(root, "node_modules/.bin/biome"),
      ["lint", "--write", "--unsafe", file],
      { cwd: root, encoding: "utf8" }
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(source);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("tailwind sorts cva variant objects using the project stylesheet", () => {
  const result = spawnSync(
    join(root, "node_modules/.bin/biome"),
    [
      "lint",
      "--config-path=biome.jsonc",
      "--write",
      "--unsafe",
      "--only=nursery/useTailwindSortedClasses",
      "--stdin-file-path=src/quality-probe.ts",
    ],
    {
      cwd: root,
      encoding: "utf8",
      input:
        'const variants = cva("", { variants: { size: { small: "px-2 flex" } } });\n',
    }
  );
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('small: "flex px-2"');
});

test.each([
  { value: "0", status: 1 },
  { value: "MetricUnit.UNSPECIFIED", status: 0 },
])("typed lint checks protobuf enum values: $value", ({ value, status }) => {
  const directory = mkdtempSync(join(root, "src", "quality-probe-"));
  const source = join(directory, "probe.ts");
  try {
    writeFileSync(
      source,
      `import { MetricUnit } from "@/protogen/querylane/console/v1alpha1/metrics_pb";\n\nexport const unit: MetricUnit = ${value};\n`
    );
    const result = spawnSync(
      join(root, "node_modules/.bin/oxlint"),
      [
        "--config",
        "oxlint.config.ts",
        "--type-aware",
        "--deny-warnings",
        source,
      ],
      { cwd: root, encoding: "utf8" }
    );
    expect(result.status).toBe(status);
    expect(
      (result.stdout + result.stderr).includes("no-unsafe-enum-assignment")
    ).toBe(status === 1);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test.each(["biome", "oxlint"])(
  "%s rejects invalid source through the real CLI",
  (tool) => {
    const directory = mkdtempSync(join(root, "src", "quality-probe-"));
    const source = join(directory, "probe.ts");
    const args =
      tool === "biome"
        ? ["check", source]
        : ["--config", "oxlint.config.ts", "--deny-warnings", source];
    try {
      writeFileSync(source, "debugger;\n");
      const result = spawnSync(join(root, "node_modules/.bin", tool), args, {
        cwd: root,
        encoding: "utf8",
      });
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).toMatch(DEBUGGER_RULE_PATTERN);
    } finally {
      rmSync(directory, { recursive: true });
    }
  }
);

function compileProbe(compiler: string, source: string) {
  const temporaryRoot = join(root, "node_modules", ".tmp");
  mkdirSync(temporaryRoot, { recursive: true });
  const directory = mkdtempSync(join(temporaryRoot, "quality-probe-"));
  const config = join(directory, "tsconfig.json");
  try {
    writeFileSync(
      config,
      JSON.stringify({
        extends: join(root, "tsconfig.strict.json"),
        compilerOptions: {
          noEmit: true,
          target: "ESNext",
          module: "ESNext",
          moduleResolution: "Bundler",
          types: ["react"],
        },
        files: [join(directory, "probe.ts"), join(root, "src/types/css.d.ts")],
      })
    );
    writeFileSync(join(directory, "probe.ts"), source);
    return spawnSync(
      join(root, "node_modules/.bin", compiler),
      ["-p", config, "--pretty", "false"],
      { cwd: root, encoding: "utf-8" }
    );
  } finally {
    rmSync(directory, { recursive: true });
  }
}

describe("strict compiler contracts", () => {
  test.each(compilers)(
    "%s permits custom CSS variables without opening arbitrary CSS properties",
    (compiler) => {
      const valid = compileProbe(
        compiler,
        'import type { CSSProperties } from "react"; export const style: CSSProperties = {"--querylane-probe": "1px", color: "red"};'
      );
      expect(valid.status).toBe(0);
      const invalid = compileProbe(
        compiler,
        'import type { CSSProperties } from "react"; export const style: CSSProperties = {querylaneInvalidProperty: "red"};'
      );
      expect(invalid.status).toBe(2);
      expect(invalid.stdout).toContain("TS2353");
    }
  );

  test.each(compilers)(
    "%s rejects unchecked indexing and explicit undefined in optional properties",
    (compiler) => {
      const result = compileProbe(
        compiler,
        "export const values: string[] = []; export const item: string = values[0]; export const options: {enabled?: boolean} = {enabled: undefined};"
      );
      expect(result.status).toBe(2);
      expect(result.stdout).toContain("TS2322");
      expect(result.stdout).toContain("TS2375");
    }
  );
});
