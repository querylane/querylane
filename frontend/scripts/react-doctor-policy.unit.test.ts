import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { env as processEnvironment } from "node:process";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

const requiredIgnoredFiles = [
  "src/components/ui/**",
  "src/protogen/**",
  "src/routeTree.gen.ts",
  "**/*.gen.ts",
  "**/*.gen.tsx",
  "**/*_pb.ts",
  "**/*_connectquery.ts",
];

const removedDependencies = [
  "@tanstack/query-core",
  "@tanstack/react-store",
  "@tanstack/store",
  "bun-types",
  "react-day-picker",
];

const strictCategories = [
  "Security",
  "Bugs",
  "Performance",
  "Accessibility",
  "Maintainability",
];

const strictDesignSurfaces = ["prComment", "score", "ciFailure"];
const MIN_COLLISION_RATIONALE_LENGTH = 50;
const reactDoctorRuleOverrides = [
  {
    files: ["src/features/data-explorer/other-database-objects-query.ts"],
    rules: ["react-doctor/server-sequential-independent-await"],
  },
] as const;
const overrideRationales = {
  "react-doctor/server-sequential-independent-await":
    "Querylane supports a single per-instance live-query slot, so these RPCs must remain sequential.",
} as const;

// React Doctor is lowest-priority in the collision order. Every disabled rule
// must retain a concrete higher-priority or framework-contract rationale.
const disabledReactDoctorRuleRationales = {
  "react-doctor/jsx-boolean-value":
    "Biome's all preset canonicalizes true JSX attributes to explicit values.",
  "react-doctor/jsx-no-constructed-context-values":
    "React Compiler stabilizes context values and repo policy bans manual memoization.",
  "react-doctor/jsx-props-no-spreading":
    "Strictly typed generic wrappers and React Hook Form require complete prop forwarding.",
  "react-doctor/no-pass-data-to-parent":
    "Canonical TanStack Router search state must be reconciled after async schema loading.",
  "react-doctor/only-export-components":
    "TanStack Router file routes must export their generated Route value beside components.",
  "react-doctor/prefer-dynamic-import":
    "Recharts modules are already lazy chunks and usePlotArea must remain a synchronous hook.",
  "react-doctor/react-in-jsx-scope":
    "TypeScript's automatic JSX runtime makes React imports unused under noUnusedLocals.",
} as const;
const allowedDisabledReactDoctorRules = Object.keys(
  disabledReactDoctorRuleRationales
).sort();

const highSignalOptInRules = [
  "react-doctor/design-no-em-dash-in-jsx-text",
  "react-doctor/design-no-redundant-padding-axes",
  "react-doctor/design-no-redundant-size-axes",
  "react-doctor/design-no-space-on-flex-children",
  "react-doctor/design-no-three-period-ellipsis",
  "react-doctor/design-no-vague-button-label",
  "react-doctor/display-name",
  "react-doctor/hook-use-state",
  "react-doctor/jsx-filename-extension",
  "react-doctor/jsx-fragments",
  "react-doctor/jsx-no-useless-fragment",
  "react-doctor/jsx-pascal-case",
  "react-doctor/no-array-index-key",
  "react-doctor/no-clone-element",
  "react-doctor/no-dark-mode-glow",
  "react-doctor/no-danger",
  "react-doctor/no-default-props",
  "react-doctor/no-generic-handler-names",
  "react-doctor/no-gradient-text",
  "react-doctor/no-justified-text",
  "react-doctor/no-prop-types",
  "react-doctor/no-pure-black-background",
  "react-doctor/no-react-children",
  "react-doctor/no-set-state",
  "react-doctor/no-side-tab-border",
  "react-doctor/no-unescaped-entities",
  "react-doctor/no-wide-letter-spacing",
  "react-doctor/no-z-index-9999",
  "react-doctor/prefer-es6-class",
  "react-doctor/prefer-function-component",
  "react-doctor/rn-animate-layout-property",
  "react-doctor/rn-prefer-content-inset-adjustment",
  "react-doctor/self-closing-comp",
  "react-doctor/state-in-constructor",
];

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonRecord(path: string) {
  const parsed: unknown = JSON.parse(
    readFileSync(resolve(projectRoot, path), "utf8")
  );

  if (!isJsonRecord(parsed)) {
    throw new Error(`${path} must be a JSON object.`);
  }

  return parsed;
}

function getRecordProperty(record: JsonRecord, key: string) {
  const value = record[key];
  if (!isJsonRecord(value)) {
    return {};
  }

  return value;
}

function getArrayProperty(record: JsonRecord, key: string) {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

describe("React Doctor policy", () => {
  test("pins the audited React Doctor release", () => {
    const packageJson = readJsonRecord("package.json");
    const devDependencies = getRecordProperty(packageJson, "devDependencies");

    expect(devDependencies["react-doctor"]).toBe("0.7.8");
  });

  test("runs every non-colliding installed rule at error severity", () => {
    const result = spawnSync(
      resolve(projectRoot, "node_modules/.bin/react-doctor"),
      ["rules", "list", "--json"],
      {
        cwd: projectRoot,
        encoding: "utf8",
        env: { ...processEnvironment, NO_COLOR: "1" },
      }
    );

    expect(result.status).toBe(0);

    const rules: unknown = JSON.parse(result.stdout);
    expect(Array.isArray(rules)).toBe(true);
    if (!Array.isArray(rules)) {
      return;
    }

    const nonBlockingRules = rules
      .filter((rule) => isJsonRecord(rule) && rule["severity"] !== "error")
      .map((rule) => (isJsonRecord(rule) ? rule["id"] : undefined))
      .filter((rule): rule is string => typeof rule === "string")
      .sort();
    expect(nonBlockingRules).toEqual(
      allowedDisabledReactDoctorRules.map((rule) =>
        rule.replace("react-doctor/", "")
      )
    );
  });

  test("uses the typed config as the active React Doctor config", () => {
    expect(existsSync(resolve(projectRoot, "doctor.config.ts"))).toBe(true);
    expect(existsSync(resolve(projectRoot, "react-doctor.config.json"))).toBe(
      true
    );
    expect(existsSync(resolve(projectRoot, "doctor.config.json"))).toBe(false);
  });

  test("keeps React Doctor strict and scoped to owned source", () => {
    const doctorConfig = readJsonRecord("react-doctor.config.json");
    const ignore = getRecordProperty(doctorConfig, "ignore");
    const ignoredFiles = getArrayProperty(ignore, "files");
    const categories = getRecordProperty(doctorConfig, "categories");
    const buckets = getRecordProperty(doctorConfig, "buckets");
    const rules = getRecordProperty(doctorConfig, "rules");
    const surfaces = getRecordProperty(doctorConfig, "surfaces");

    expect(doctorConfig["blocking"]).toBe("warning");
    expect(doctorConfig["warnings"]).toBe(true);
    expect(doctorConfig["lint"]).toBe(true);
    expect(doctorConfig["deadCode"]).toBe(true);
    expect(doctorConfig["respectInlineDisables"]).toBe(false);

    expect(ignoredFiles).toEqual(expect.arrayContaining(requiredIgnoredFiles));
    expect(ignoredFiles).not.toContain("src/components/querylane-ui/**");
    expect(ignore["rules"] ?? []).toEqual([]);
    expect(ignore["tags"] ?? []).toEqual([]);
    expect(ignore["overrides"]).toEqual(reactDoctorRuleOverrides);
    for (const override of reactDoctorRuleOverrides) {
      for (const rule of override.rules) {
        expect(overrideRationales[rule].length).toBeGreaterThan(
          MIN_COLLISION_RATIONALE_LENGTH
        );
      }
    }

    for (const category of strictCategories) {
      expect(categories[category]).toBe("error");
    }
    expect(buckets["compiler-cleanup"]).toBe("error");

    const disabledRules = Object.entries(rules)
      .filter(([, level]) => level === "off")
      .map(([rule]) => rule)
      .sort();
    expect(disabledRules).toEqual(allowedDisabledReactDoctorRules);
    for (const disabledRule of disabledRules) {
      expect(
        disabledReactDoctorRuleRationales[
          disabledRule as keyof typeof disabledReactDoctorRuleRationales
        ].length
      ).toBeGreaterThan(MIN_COLLISION_RATIONALE_LENGTH);
    }
    expect(Object.values(rules)).not.toContain("warn");
    for (const optInRule of highSignalOptInRules) {
      expect(rules[optInRule]).toBe("error");
    }

    for (const surface of strictDesignSurfaces) {
      const controls = getRecordProperty(surfaces, surface);
      expect(getArrayProperty(controls, "includeTags")).toContain("design");
    }
  });

  test("runs full dead-code analysis in the frontend static job", () => {
    const packageJson = readJsonRecord("package.json");
    const scripts = getRecordProperty(packageJson, "scripts");
    const frontendWorkflow = readFileSync(
      resolve(projectRoot, "../.github/workflows/frontend-ci.yml"),
      "utf8"
    );

    expect(scripts["doctor:dead-code"]).toBe(
      "react-doctor . -y --scope full --no-lint --blocking warning --no-respect-inline-disables --no-score"
    );
    expect(frontendWorkflow).toContain(
      "- name: Run React Doctor dead-code analysis\n        run: bun run doctor:dead-code"
    );
    expect(frontendWorkflow).toContain(
      "doctor\\.config\\.ts|react-doctor\\.config\\.json"
    );
  });

  test("keeps supply-chain checks while disabling score telemetry", () => {
    const packageJson = readJsonRecord("package.json");
    const scripts = getRecordProperty(packageJson, "scripts");
    const ciRunner = readFileSync(
      resolve(projectRoot, "scripts/run-react-doctor-ci.ts"),
      "utf8"
    );

    for (const scriptName of ["doctor", "doctor:changed", "doctor:full"]) {
      const script = scripts[scriptName];
      expect(typeof script).toBe("string");
      expect(script).toContain("--supply-chain");
      expect(script).toContain("--no-score");
    }
    expect(ciRunner).toContain('"--supply-chain"');
    expect(ciRunner).toContain('"--no-score"');
  });

  test("runs a full Doctor scan when tool policy changes", () => {
    const ciRunner = readFileSync(
      resolve(projectRoot, "scripts/run-react-doctor-ci.ts"),
      "utf8"
    );

    expect(ciRunner).toContain("requiresFullStaticAnalysisFromBase");
    expect(ciRunner).toContain('fullScanRequired ? "full" : "changed"');
  });

  test("excludes the UI registry without excluding Querylane UI", () => {
    const doctorConfig = readJsonRecord("react-doctor.config.json");
    const ignore = getRecordProperty(doctorConfig, "ignore");
    const ignoredFiles = getArrayProperty(ignore, "files").filter(
      (file): file is string => typeof file === "string"
    );
    expect(ignoredFiles).toContain("src/components/ui/**");
    expect(ignoredFiles).not.toContain("src/components/querylane-ui/**");
    expect(ignore["overrides"]).toEqual(reactDoctorRuleOverrides);
    expect(existsSync(resolve(projectRoot, "knip.json"))).toBe(false);
  });

  test("uses the Querylane package identity without dead dependencies", () => {
    const packageJson = readJsonRecord("package.json");
    const dependencies = getRecordProperty(packageJson, "dependencies");
    const devDependencies = getRecordProperty(packageJson, "devDependencies");
    const changesetReadme = readFileSync(
      resolve(projectRoot, ".changeset/README.md"),
      "utf8"
    );

    expect(packageJson["name"]).toBe("@querylane/frontend");
    expect(changesetReadme).toContain("@querylane/frontend");
    expect(changesetReadme).not.toContain("frontend-new");
    for (const dependency of removedDependencies) {
      expect(dependencies[dependency]).toBeUndefined();
      expect(devDependencies[dependency]).toBeUndefined();
    }
  });
});
