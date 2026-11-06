import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { isRecord, isUnknownArray } from "../src/lib/value-guards";

const entrypoints = [
  "lint",
  "lint:fix",
  "lint:biome",
  "lint:oxlint",
  "lint:shadcn",
  "lint:changed",
  "doctor",
  "doctor:full",
  "doctor:ci",
  "doctor:dead-code",
  "quality:gate",
  "quality:changed",
  "quality:rules",
  "type:check",
  "type:check:ui",
  "type:check:canary",
  "build",
  "dev:scan",
];

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function options(rules: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(rules).flatMap(([name, value]) => {
      if (isUnknownArray(value) && value.length > 1) {
        return [[name, value.slice(1)]];
      }
      const configured = record(value)["options"];
      return configured === undefined ? [] : [[name, configured]];
    })
  );
}

function biomeOptions(
  config: Record<string, unknown>
): Record<string, unknown> {
  const groups = record(record(config["linter"])["rules"]);
  return Object.fromEntries(
    Object.entries(groups).flatMap(([group, rules]) =>
      Object.entries(options(record(rules))).map(([rule, value]) => [
        `${group}/${rule}`,
        value,
      ])
    )
  );
}

function overrides(config: Record<string, unknown>, biome: boolean): unknown[] {
  const values = config["overrides"];
  return (isUnknownArray(values) ? values : []).flatMap((value) => {
    const role = record(value);
    const rules = biome ? biomeOptions(role) : options(record(role["rules"]));
    return Object.keys(rules).length === 0
      ? []
      : [{ scope: role[biome ? "includes" : "files"], rules }];
  });
}

async function configuration(
  root: string,
  name: string
): Promise<Record<string, unknown>> {
  const loaded: unknown = await import(join(root, name));
  return record(record(loaded)["default"]);
}

function jsonFile(root: string, name: string): unknown {
  const parsed: unknown = JSON.parse(readFileSync(join(root, name), "utf8"));
  return parsed;
}

async function currentOptions(root: string): Promise<unknown> {
  const [biome, oxlint, doctor] = await Promise.all([
    configuration(root, "biome.jsonc"),
    configuration(root, "oxlint.config.ts"),
    configuration(root, "doctor.config.ts"),
  ]);
  const scripts = record(record(jsonFile(root, "package.json"))["scripts"]);
  const snapshot = {
    biome: {
      rules: biomeOptions(biome),
      overrides: overrides(biome, true),
      assist: biome["assist"],
      jsonAssist: record(biome["json"])["assist"],
    },
    oxlint: {
      rules: options(record(oxlint["rules"])),
      overrides: overrides(oxlint, false),
      settings: oxlint["settings"],
    },
    doctor: { surfaces: doctor["surfaces"] },
    entrypoints: Object.fromEntries(
      entrypoints.map((name) => [name, scripts[name]])
    ),
  };
  return snapshot;
}

async function assertReviewedQualityOptions(root: string): Promise<void> {
  const expected = jsonFile(root, "quality/rule-options.json");
  if (!isDeepStrictEqual(expected, await currentOptions(root))) {
    throw new Error(
      "Reviewed quality options changed; compare scripts/quality-options.ts output with quality/rule-options.json and review the policy change."
    );
  }
}

if (import.meta.main) {
  console.log(
    JSON.stringify(
      await currentOptions(resolve(import.meta.dirname, "..")),
      null,
      2
    )
  );
}

export { assertReviewedQualityOptions };
