import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

const requiredIgnoredFiles = [
  "src/components/querylane-ui/**",
  "src/protogen/**",
  "src/routeTree.gen.ts",
  "**/*.gen.ts",
  "**/*.gen.tsx",
  "**/*_pb.ts",
  "**/*_connectquery.ts",
];

const deadRegistryFiles = new Set([
  "src/components/ui/calendar.tsx",
  "src/components/ui/combobox.tsx",
  "src/components/ui/kbd.tsx",
]);

// The main tsconfig resolves these imports through emitted declarations, so
// React Doctor cannot trace source-file reachability. Suppress only that rule.
const querylaneUiUnusedFileOverrides = [
  "src/components/ui/copy-icon-button.tsx",
  "src/components/ui/data-table-faceted-filter.tsx",
  "src/components/ui/data-table-filter-toolbar.tsx",
  "src/components/ui/data-table.tsx",
  "src/components/ui/disabled-reason-button.tsx",
  "src/components/ui/inline-code.tsx",
  "src/components/ui/overflow-tooltip.tsx",
  "src/components/ui/refresh-control.tsx",
  "src/components/ui/sql-code-block.tsx",
  "src/components/ui/status-indicator.tsx",
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

const documentedDisabledRuleRationales = {
  "react-doctor/forbid-component-props":
    "className is an intentional Tailwind/shadcn styling API.",
  "react-doctor/jsx-boolean-value":
    "formatter territory, no correctness signal.",
  "react-doctor/jsx-handler-names":
    "false positive for on… props forwarded through a controls/slot object.",
  "react-doctor/jsx-no-constructed-context-values":
    "React Compiler auto-memoizes context values; manual useMemo is banned.",
  "react-doctor/jsx-no-jsx-as-prop":
    "React Compiler auto-memoizes JSX props; manual memoization is banned.",
  "react-doctor/jsx-props-no-spreading":
    "typed wrapper components intentionally forward prop surfaces.",
  "react-doctor/no-adjust-state-on-prop-change":
    "false positive for intentional setTimeout-based loading debounce.",
  "react-doctor/react-in-jsx-scope":
    "React 19 automatic JSX runtime does not need React in scope.",
};

const highSignalOptInRules = [
  "react-doctor/design-no-em-dash-in-jsx-text",
  "react-doctor/design-no-redundant-padding-axes",
  "react-doctor/design-no-redundant-size-axes",
  "react-doctor/design-no-space-on-flex-children",
  "react-doctor/design-no-three-period-ellipsis",
  "react-doctor/design-no-vague-button-label",
  "react-doctor/display-name",
  "react-doctor/hook-use-state",
  "react-doctor/jsx-curly-brace-presence",
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
    expect(ignore["rules"] ?? []).toEqual([]);
    expect(ignore["tags"] ?? []).toEqual([]);

    for (const category of strictCategories) {
      expect(categories[category]).toBe("error");
    }
    expect(buckets["compiler-cleanup"]).toBe("error");

    const disabledRules = Object.entries(rules)
      .filter(([, level]) => level === "off")
      .map(([rule]) => rule)
      .sort();
    expect(disabledRules).toEqual(
      Object.keys(documentedDisabledRuleRationales).sort()
    );
    for (const disabledRule of disabledRules) {
      expect(
        documentedDisabledRuleRationales[
          disabledRule as keyof typeof documentedDisabledRuleRationales
        ].length
      ).toBeGreaterThan(20);
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

  test("uses explicit existing UI ignores instead of a blind registry glob", () => {
    const doctorConfig = readJsonRecord("react-doctor.config.json");
    const ignore = getRecordProperty(doctorConfig, "ignore");
    const ignoredFiles = getArrayProperty(ignore, "files").filter(
      (file): file is string => typeof file === "string"
    );
    const ignoredUiFiles = ignoredFiles
      .filter((file) => file.startsWith("src/components/ui/"))
      .sort();
    expect(ignoredFiles).not.toContain("src/components/ui/**");
    expect(ignoredUiFiles.length).toBeGreaterThan(0);
    for (const ignoredUiFile of ignoredUiFiles) {
      expect(existsSync(resolve(projectRoot, ignoredUiFile))).toBe(true);
    }
    for (const deadRegistryFile of deadRegistryFiles) {
      expect(ignoredUiFiles).not.toContain(deadRegistryFile);
      expect(existsSync(resolve(projectRoot, deadRegistryFile))).toBe(false);
    }
    for (const querylaneUiFile of querylaneUiUnusedFileOverrides) {
      expect(ignoredUiFiles).not.toContain(querylaneUiFile);
    }
    expect(ignore["overrides"]).toEqual([
      {
        files: querylaneUiUnusedFileOverrides,
        rules: ["deslop/unused-file"],
      },
    ]);
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
