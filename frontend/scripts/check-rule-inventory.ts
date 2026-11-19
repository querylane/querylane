import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import landminesStructure from "@interfere/landmines/structure";
import landminesStyle from "@interfere/landmines/style";
import landminesTesting from "@interfere/landmines/testing";
import landminesTypes from "@interfere/landmines/types";
import shadcn from "@shadcn/lint";
import { z } from "zod";
import oxlintConfig from "../oxlint.config";
import { isRecord } from "../src/lib/value-guards";
import { assertQualityBoundaries, ruleSeverity } from "./quality-boundaries";
import { assertReviewedQualityOptions } from "./quality-options";
import querylanePlugin from "./querylane-lint.config";

const ROOT = resolve(import.meta.dirname, "..");
const ESLINT_SCOPE_PATTERN = /^eslint\//u;
const RULE_TOOLS = [
  "biome",
  "oxlint",
  "reactDoctor",
  "shadcn",
  "querylane",
  "landmines",
] as const;
const ruleEntry = z
  .object({
    rule: z.string().min(1),
    decision: z.enum(["error", "scoped-error", "delegated", "inapplicable"]),
    reason: z.string().min(1),
    scope: z.array(z.string().min(1)).min(1).optional(),
    owner: z
      .object({
        tool: z.enum([
          "biome",
          "oxlint",
          "reactDoctor",
          "shadcn",
          "querylane",
          "landmines",
          "typescript",
        ]),
        rule: z.string().min(1),
      })
      .optional(),
  })
  .refine(
    (entry) =>
      (entry.decision === "scoped-error") === (entry.scope !== undefined),
    {
      message: "Only scoped errors must declare their file-role scope",
    }
  )
  .refine(
    (entry) => (entry.decision === "delegated") === (entry.owner !== undefined),
    {
      message: "Only delegated rules must declare an enforcement owner",
    }
  );
const inventorySchema = z.object({
  versions: z.record(z.string(), z.string()),
  biome: z.array(ruleEntry),
  oxlint: z.array(ruleEntry),
  reactDoctor: z.array(ruleEntry),
  shadcn: z.array(ruleEntry),
  querylane: z.array(ruleEntry),
  landmines: z.array(ruleEntry),
});

const landminesPlugins = [
  {
    alias: "landmines-structure",
    specifier: "@interfere/landmines/structure",
    rules: landminesStructure.rules,
  },
  {
    alias: "landmines-style",
    specifier: "@interfere/landmines/style",
    rules: landminesStyle.rules,
  },
  {
    alias: "landmines-testing",
    specifier: "@interfere/landmines/testing",
    rules: landminesTesting.rules,
  },
  {
    alias: "landmines-types",
    specifier: "@interfere/landmines/types",
    rules: landminesTypes.rules,
  },
];

function assertReviewedRuleIds(
  reviewed: readonly string[],
  actual: readonly string[]
) {
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

function readJson(path: string) {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  return value;
}

function toolJson(tool: string, args: readonly string[]) {
  const result = spawnSync(join(ROOT, "node_modules/.bin", tool), args, {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `${tool} catalog failed (${result.status ?? result.signal ?? "spawn error"}): ${result.stdout}${result.stderr}`,
      { cause: result.error }
    );
  }
  const value: unknown = JSON.parse(result.stdout);
  return value;
}

function biomeRuleIds() {
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
  const config = z
    .object({
      plugins: z.array(z.string()),
      rules: z.record(z.string(), z.unknown()),
      overrides: z.array(
        z.object({
          files: z.array(z.string()),
          rules: z.record(z.string(), z.unknown()),
        })
      ),
    })
    .parse(
      toolJson("oxlint", ["--config", "oxlint.config.ts", "--print-config"])
    );
  const plugins = new Set(config.plugins);
  for (const entry of entries) {
    const rule = entry.rule.replace(ESLINT_SCOPE_PATTERN, "");
    const [scope] = entry.rule.split("/");
    const inactivePlugin =
      scope !== "eslint" && !plugins.has(scope?.replaceAll("_", "-") ?? "");
    assertReviewedLevel(entry, config.rules[rule], inactivePlugin);
    assertRuleOverrides(entry, config.overrides);
  }
}

function assertRuleOverrides(
  entry: z.infer<typeof ruleEntry>,
  configuredOverrides: { files: string[]; rules: Record<string, unknown> }[]
) {
  const rule = entry.rule.replace(ESLINT_SCOPE_PATTERN, "");
  const overrides = configuredOverrides.filter(
    (override) => override.rules[rule] !== undefined
  );
  if (entry.decision === "scoped-error") {
    const [override, ...extra] = overrides;
    const scope = entry.scope ?? [];
    const files = new Set(override?.files);
    if (
      override === undefined ||
      extra.length > 0 ||
      override.files.length !== scope.length ||
      scope.some((file) => !files.has(file))
    ) {
      throw new Error(`Reviewed rule scope is not enforced: ${entry.rule}`);
    }
    assertErrorLevel(entry.rule, override.rules[rule]);
  } else if (entry.decision !== "error") {
    for (const override of overrides) {
      assertReviewedLevel(entry, override.rules[rule]);
    }
  }
}

function assertErrorLevel(rule: string, configured: unknown) {
  const severity = ruleSeverity(configured);
  if (severity !== "deny" && severity !== "error" && severity !== 2) {
    throw new Error(`Reviewed error rule is not enforced: ${rule}`);
  }
}

function assertReviewedLevel(
  entry: z.infer<typeof ruleEntry>,
  configured: unknown,
  allowMissing = false
) {
  if (entry.decision === "error") {
    assertErrorLevel(entry.rule, configured);
    return;
  }
  const severity = ruleSeverity(configured);
  if (
    !(allowMissing && severity === undefined) &&
    severity !== "off" &&
    severity !== "allow" &&
    severity !== 0
  ) {
    throw new Error(`Reviewed disabled rule is not off: ${entry.rule}`);
  }
}

async function assertBiomeRuleLevels(entries: z.infer<typeof ruleEntry>[]) {
  const module: unknown = await import(join(ROOT, "biome.jsonc"));
  const config = z
    .object({
      default: z.object({
        linter: z.object({
          enabled: z.boolean().optional(),
          rules: z.record(z.string(), z.unknown()),
        }),
        overrides: z.array(
          z.object({
            includes: z.array(z.string()),
            linter: z
              .object({
                rules: z
                  .record(z.string(), z.record(z.string(), z.unknown()))
                  .optional(),
              })
              .optional(),
          })
        ),
      }),
    })
    .parse(module).default;
  const { rules, enabled } = config.linter;
  if (enabled === false) {
    throw new Error("Biome linter must remain enabled");
  }
  await assertPlaywrightPresetRules(rules);
  const overrides = config.overrides.map((override) => ({
    files: override.includes,
    rules: Object.fromEntries(
      Object.entries(override.linter?.rules ?? {}).flatMap(
        ([group, groupRules]) =>
          Object.entries(groupRules).map(([name, value]) => [
            `${group}/${name}`,
            value,
          ])
      )
    ),
  }));
  for (const entry of entries) {
    const [group, name] = entry.rule.split("/");
    const groupRules = rules[group ?? ""];
    assertReviewedLevel(
      entry,
      isRecord(groupRules) ? groupRules[name ?? ""] : undefined
    );
    assertRuleOverrides(entry, overrides);
  }
}

async function assertPlaywrightPresetRules(rules: Record<string, unknown>) {
  const presetModule: unknown = await import(
    import.meta.resolve("ultracite/biome/playwright")
  );
  const presetRules = z
    .object({
      default: z.object({
        linter: z.object({
          rules: z.record(z.string(), z.record(z.string(), z.unknown())),
        }),
      }),
    })
    .parse(presetModule).default.linter.rules;
  for (const [group, groupRules] of Object.entries(presetRules)) {
    for (const name of Object.keys(groupRules)) {
      const configuredGroup = rules[group];
      const configured = isRecord(configuredGroup)
        ? configuredGroup[name]
        : undefined;
      try {
        assertErrorLevel(`${group}/${name}`, configured);
      } catch (error) {
        throw new Error(
          `Playwright preset rule is not enforced: ${group}/${name}`,
          { cause: error }
        );
      }
    }
  }
}

async function assertDoctorRuleLevels(
  entries: z.infer<typeof ruleEntry>[],
  doctor: { key: string; severity: string }[]
) {
  const { default: doctorConfig } = await import("../doctor.config");
  if (
    (doctorConfig.ignore?.rules?.length ?? 0) > 0 ||
    (doctorConfig.ignore?.tags?.length ?? 0) > 0 ||
    (doctorConfig.ignore?.overrides?.length ?? 0) > 0
  ) {
    throw new Error(
      "Doctor rule, tag and per-file suppressions are not permitted"
    );
  }
  const severities = new Map(
    doctor.map((entry) => [entry.key, entry.severity])
  );
  for (const entry of entries) {
    assertReviewedLevel(entry, severities.get(entry.rule));
  }
}

function assertPluginBinding(alias: string, specifier: string) {
  const reviewed = resolvedPluginPath(specifier);
  const bindings = (oxlintConfig.jsPlugins ?? []).flatMap((plugin) => {
    if (typeof plugin === "string") {
      const path = resolvedPluginPath(plugin);
      return alias === "shadcn" && path === reviewed ? [path] : [];
    }
    return plugin.name === alias ? [resolvedPluginPath(plugin.specifier)] : [];
  });
  if (bindings.length !== 1 || bindings[0] !== reviewed) {
    throw new Error(`Reviewed ${alias} plugin is not enforced`);
  }
}

function assertPluginRules(
  entries: z.infer<typeof ruleEntry>[],
  plugins: readonly {
    alias: string;
    specifier: string;
    rules: Readonly<Record<string, unknown>>;
  }[]
) {
  for (const { alias, specifier } of plugins) {
    assertPluginBinding(alias, specifier);
  }
  assertReviewedRuleIds(
    entries.map((entry) => entry.rule),
    plugins.flatMap(({ alias, rules }) =>
      Object.keys(rules).map((rule) => `${alias}/${rule}`)
    )
  );
  const configuredRules = new Map(Object.entries(oxlintConfig.rules));
  for (const entry of entries) {
    assertReviewedLevel(entry, configuredRules.get(entry.rule));
  }
}

function resolvedPluginPath(specifier: string) {
  return realpathSync(
    fileURLToPath(
      import.meta.resolve(specifier, join(ROOT, "oxlint.config.ts"))
    )
  );
}

async function assertDelegatedOwners(
  inventory: z.infer<typeof inventorySchema>,
  compiler: ReadonlySet<string>
) {
  const biomeModule: unknown = await import(join(ROOT, "biome.jsonc"));
  const biome = z
    .object({
      default: z.object({
        formatter: z.object({ enabled: z.boolean() }),
        assist: z.object({
          enabled: z.boolean().optional(),
          actions: z.object({ source: z.record(z.string(), z.unknown()) }),
        }),
      }),
    })
    .parse(biomeModule).default;
  const assists =
    biome.assist.enabled === false ? {} : biome.assist.actions.source;
  const owners = new Set([
    ...RULE_TOOLS.flatMap((tool) =>
      inventory[tool].flatMap((entry) =>
        entry.decision === "error" ? [`${tool}/${entry.rule}`] : []
      )
    ),
    ...Array.from(compiler, (rule) => `typescript/${rule}`),
    ...Object.entries(assists).flatMap(([rule, level]) =>
      level === "on" ? [`biome/assist/source/${rule}`] : []
    ),
    ...(biome.formatter.enabled ? ["biome/formatter"] : []),
  ]);
  const entries = RULE_TOOLS.flatMap((tool) => inventory[tool]);
  for (const entry of entries) {
    if (entry.decision !== "delegated" || entry.owner === undefined) {
      continue;
    }
    const { tool, rule } = entry.owner;
    if (!owners.has(`${tool}/${rule}`)) {
      throw new Error(
        `Delegated owner is not enforced: ${entry.rule} -> ${tool}/${rule}`
      );
    }
  }
}

async function checkRuleInventory() {
  const inventory = inventorySchema.parse(
    readJson(join(ROOT, "quality/rule-inventory.json"))
  );
  const compiler = await assertQualityBoundaries(ROOT);
  const native = z
    .array(z.object({ scope: z.string(), value: z.string() }))
    .parse(toolJson("oxlint", ["--rules", "--format", "json"]));
  const doctor = z
    .array(z.object({ key: z.string(), severity: z.string() }))
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
  assertPluginRules(inventory.shadcn, [
    { alias: "shadcn", specifier: "@shadcn/lint", rules: shadcn.rules },
  ]);
  assertPluginRules(inventory.querylane, [
    {
      alias: "querylane",
      specifier: "./scripts/querylane-lint.config.ts",
      rules: querylanePlugin.rules,
    },
  ]);
  assertPluginRules(inventory.landmines, landminesPlugins);
  await assertBiomeRuleLevels(inventory.biome);
  assertNativeRuleLevels(inventory.oxlint);
  await assertDoctorRuleLevels(inventory.reactDoctor, doctor);
  await assertDelegatedOwners(inventory, compiler);
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
    const installed = z
      .object({ version: z.string() })
      .parse(readJson(join(ROOT, "node_modules", name, "package.json")));
    if (installed.version !== version) {
      throw new Error(
        `Installed ${name} version does not match the reviewed version: ${installed.version} != ${version}.`
      );
    }
  }
  await assertReviewedQualityOptions(ROOT);
  console.log("Every installed rule has a recorded policy decision.");
}

if (import.meta.main) {
  await checkRuleInventory();
}
