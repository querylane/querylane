import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { isUnknownArray } from "../src/lib/value-guards";

const ROOT = resolve(import.meta.dirname, "..");
const ESLINT_SCOPE_PATTERN = /^eslint\//u;
const ruleEntry = z.object({
  rule: z.string().min(1),
  decision: z.enum(["error", "delegated", "inapplicable"]),
  reason: z.string().min(1),
});
const inventorySchema = z.object({
  versions: z.record(z.string(), z.string()),
  biome: z.array(ruleEntry),
  oxlint: z.array(ruleEntry),
  reactDoctor: z.array(ruleEntry),
  shadcn: z.array(ruleEntry),
});

function assertReviewedRuleIds(
  reviewed: readonly string[],
  actual: readonly string[]
): void {
  const known = new Set(reviewed);
  if (known.size !== reviewed.length) {
    throw new Error("Duplicate rule inventory entries");
  }
  const current = new Set(actual);
  const missing = actual.filter((rule) => !known.has(rule));
  const stale = reviewed.filter((rule) => !current.has(rule));
  if (missing.length > 0 || stale.length > 0) {
    throw new Error(
      `Rule inventory requires review. New: ${missing.join(", ")}. Removed: ${stale.join(", ")}.`
    );
  }
}

function readJson(path: string): unknown {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  return value;
}

function toolJson(tool: string, args: readonly string[]): unknown {
  const result = spawnSync(join(ROOT, "node_modules/.bin", tool), args, {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${tool} catalog failed: ${result.stderr}`);
  }
  const value: unknown = JSON.parse(result.stdout);
  return value;
}

function biomeRuleIds(): string[] {
  const schema = z
    .record(z.string(), z.unknown())
    .parse(
      readJson(
        join(ROOT, "node_modules/@biomejs/biome/configuration_schema.json")
      )
    );
  const definitions = z.record(z.string(), z.unknown()).parse(schema["$defs"]);
  const properties = z.object({
    properties: z.record(z.string(), z.unknown()),
  });
  const groups = Object.keys(properties.parse(definitions["Rules"]).properties);
  return groups.flatMap((group) => {
    const definition =
      definitions[group.charAt(0).toUpperCase() + group.slice(1)];
    if (definition === undefined) {
      return [];
    }
    return Object.keys(properties.parse(definition).properties).flatMap(
      (rule) =>
        rule === "preset" || rule === "recommended" ? [] : [`${group}/${rule}`]
    );
  });
}

function assertNativeRuleLevels(entries: z.infer<typeof ruleEntry>[]) {
  const configuredRules = z
    .object({ rules: z.record(z.string(), z.unknown()) })
    .parse(
      toolJson("oxlint", ["--config", "oxlint.config.ts", "--print-config"])
    ).rules;
  for (const entry of entries) {
    if (entry.decision !== "error") {
      continue;
    }
    const configured =
      configuredRules[entry.rule.replace(ESLINT_SCOPE_PATTERN, "")];
    const level = isUnknownArray(configured) ? configured[0] : configured;
    if (level !== "deny" && level !== "error" && level !== 2) {
      throw new Error(`Reviewed error rule is not enforced: ${entry.rule}`);
    }
  }
}

function checkRuleInventory() {
  const inventory = inventorySchema.parse(
    readJson(join(ROOT, "quality/rule-inventory.json"))
  );
  const native = z
    .array(z.object({ scope: z.string(), value: z.string() }))
    .parse(toolJson("oxlint", ["--rules", "--format", "json"]));
  const doctor = z
    .array(z.object({ key: z.string() }))
    .parse(toolJson("react-doctor", ["rules", "list", "--json"]));
  assertReviewedRuleIds(
    inventory.oxlint.map((entry) => entry.rule),
    native.map((entry) => `${entry.scope}/${entry.value}`)
  );
  assertReviewedRuleIds(
    inventory.reactDoctor.map((entry) => entry.rule),
    doctor.map((entry) => entry.key)
  );
  assertReviewedRuleIds(
    inventory.biome.map((entry) => entry.rule),
    biomeRuleIds()
  );
  assertNativeRuleLevels(inventory.oxlint);
  const manifest = z
    .object({
      dependencies: z.record(z.string(), z.string()),
      devDependencies: z.record(z.string(), z.string()),
    })
    .parse(readJson(join(ROOT, "package.json")));
  for (const [name, version] of Object.entries(inventory.versions)) {
    if (
      (manifest.devDependencies[name] ?? manifest.dependencies[name]) !==
      version
    ) {
      throw new Error(
        `Review ${name} rules before updating the recorded version.`
      );
    }
  }
  console.log("Every installed rule has a recorded policy decision.");
}

if (import.meta.main) {
  checkRuleInventory();
}

export { assertReviewedRuleIds };
