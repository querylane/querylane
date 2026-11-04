import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@rstest/core";

const root = resolve(import.meta.dirname, "..");

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
