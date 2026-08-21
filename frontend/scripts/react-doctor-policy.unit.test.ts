import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { env as processEnvironment } from "node:process";
import { describe, expect, test } from "@rstest/core";

const projectRoot = resolve(import.meta.dirname, "..");

const requiredIgnoredFiles = [
  "src/components/ui/**",
  "src/protogen/**",
  "**/*.gen.ts",
  "**/*.gen.tsx",
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
  {
    files: [
      "src/components/app-error-view.tsx",
      "src/components/console-pages/roles-access-map-canvas.tsx",
      "src/features/data-explorer/explorer-schema-map.tsx",
      "src/features/data-explorer/explorer-table-detail/definition-tab.tsx",
      "src/features/database-visualization/database-structure-map.tsx",
    ],
    rules: ["react-doctor/no-cramped-container-padding"],
  },
  {
    files: ["src/components/onboarding-wizard/wizard-content.tsx"],
    rules: ["react-doctor/no-decorative-grid-background"],
  },
  {
    files: ["src/components/charts/chart-tooltip.tsx"],
    rules: ["react-doctor/no-hairline-border-wide-shadow"],
  },
  {
    files: [
      "src/components/onboarding-wizard/phases/manual-yaml-phase.tsx",
      "src/components/onboarding-wizard/wizard-content.tsx",
      "src/routes/new-instance-connection-fields.tsx",
    ],
    rules: ["react-doctor/no-nested-card-surface"],
  },
  {
    files: [
      "src/components/onboarding-wizard/phases/embedded-phase.tsx",
      "src/components/onboarding-wizard/phases/ui-configured-phase.tsx",
      "src/components/onboarding-wizard/wizard-content.tsx",
    ],
    rules: ["react-doctor/no-pure-black-shadow"],
  },
  {
    files: [
      "src/components/console-pages/instance-metrics-panel.tsx",
      "src/features/data-explorer/object-detail-chrome.tsx",
    ],
    rules: ["react-doctor/shadcn-tabs-trigger-requires-list"],
  },
  {
    files: ["src/features/data-explorer/table-data/table-data-query.ts"],
    rules: ["react-doctor/no-pass-live-state-to-parent"],
  },
  {
    files: [
      "src/components/console-pages/database-overview-sections.tsx",
      "src/components/console-pages/role-detail-builtins.tsx",
      "src/components/console-pages/role-detail-shared.tsx",
      "src/components/data-grid/table-data-grid/record-field.tsx",
      "src/features/data-explorer/explorer-table-detail/policies-tab.tsx",
    ],
    rules: ["react-doctor/no-tiny-uppercase-tracked-label"],
  },
  {
    files: [
      "src/components/querylane-ui/sidebar.tsx",
      "src/features/data-explorer/explorer-sidebar.tsx",
    ],
    rules: ["react-hooks-js/refs"],
  },
  {
    files: ["src/components/querylane-ui/sidebar.tsx"],
    rules: ["react-hooks-js/purity"],
  },
  {
    files: [
      "src/components/querylane-ui/use-mobile.ts",
      "src/components/use-retained-retry-error.ts",
      "src/features/data-explorer/explorer-sidebar.tsx",
      "src/features/data-explorer/explorer-table-detail.tsx",
      "src/hooks/api/onboarding.ts",
      "src/hooks/use-minimum-spin.ts",
    ],
    rules: ["react-hooks-js/set-state-in-effect"],
  },
  {
    files: [
      "src/features/data-explorer/explorer-resource-button.tsx",
      "src/features/data-explorer/explorer-schema-detail.tsx",
    ],
    rules: ["react-hooks-js/static-components"],
  },
  {
    files: [
      "src/components/admin-ops/storage-section.tsx",
      "src/components/app-error-view.tsx",
      "src/components/charts/chart-container.tsx",
      "src/features/data-explorer/explorer-table-detail/shared-ui.tsx",
    ],
    rules: ["react-hooks-js/todo"],
  },
] as const;
const overrideRationales = {
  "react-doctor/no-cramped-container-padding":
    "These compact badges and graph annotations need to preserve dense data layouts rather than card-sized padding.",
  "react-doctor/no-decorative-grid-background":
    "The onboarding rail grid is part of Querylane's branded visual treatment and remains non-interactive.",
  "react-doctor/no-hairline-border-wide-shadow":
    "The chart tooltip needs both a boundary over plotted data and elevation above overlapping chart marks.",
  "react-doctor/no-nested-card-surface":
    "These nested surfaces distinguish form inputs, setup alternatives, and status summaries inside larger workflow panels.",
  "react-doctor/no-pass-live-state-to-parent":
    "Canonical TanStack Router search state must be reconciled after async schema loading.",
  "react-doctor/no-pure-black-shadow":
    "The black shadows belong to the deliberately near-black onboarding surface and preserve its established depth.",
  "react-doctor/no-tiny-uppercase-tracked-label":
    "These compact database metadata and SQL labels intentionally use the established uppercase technical convention.",
  "react-doctor/server-sequential-independent-await":
    "Querylane supports a single per-instance live-query slot, so these RPCs must remain sequential.",
  "react-doctor/shadcn-tabs-trigger-requires-list":
    "Both trigger helpers are rendered only as children of their owning TabsList wrappers; the rule cannot follow that abstraction.",
  "react-hooks-js/purity":
    "The randomized skeleton width is display-only, stable for the component lifetime, and never influences application state.",
  "react-hooks-js/refs":
    "These refs hold stable display-only or TanStack Virtual integration state that must be read while constructing the view.",
  "react-hooks-js/set-state-in-effect":
    "These effects intentionally synchronize browser APIs, retry retention, URL state, loading phases, or minimum display timing.",
  "react-hooks-js/static-components":
    "These render paths intentionally select a stable imported icon component from typed resource metadata.",
  "react-hooks-js/todo":
    "React Compiler reports a generic unsupported optimization here without identifying a safe behavior-preserving rewrite.",
} as const;

// React Doctor is lowest-priority in the collision order. Every disabled rule
// must retain a concrete higher-priority, applicability, or framework rationale.
const disabledReactDoctorRuleRationales = {
  "react-doctor/context-provider-value-from-unmemoized-local-literal":
    "React Compiler stabilizes provider values automatically, and repository policy forbids duplicating that memoization manually.",
  "react-doctor/ink-newline-inside-text":
    "Querylane ships browser React only, and upstream marks this Ink diagnostic retired with no change required.",
  "react-doctor/ink-prefer-use-paste":
    "Querylane ships browser React with no Ink terminal UI, so Ink paste event hooks do not apply.",
  "react-doctor/ink-suspense-requires-concurrent":
    "Querylane ships browser React only, and upstream marks this Ink diagnostic retired with no change required.",
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
  "react-doctor/aria-braille-equivalent",
  "react-doctor/data-table-requires-accessible-name",
  "react-doctor/design-no-em-dash-in-jsx-text",
  "react-doctor/design-no-redundant-padding-axes",
  "react-doctor/design-no-redundant-size-axes",
  "react-doctor/design-no-space-on-flex-children",
  "react-doctor/design-no-three-period-ellipsis",
  "react-doctor/design-no-vague-button-label",
  "react-doctor/details-requires-summary",
  "react-doctor/display-name",
  "react-doctor/empty-table-header",
  "react-doctor/fieldset-requires-legend",
  "react-doctor/form-control-requires-name",
  "react-doctor/hook-use-state",
  "react-doctor/html-xml-lang-mismatch",
  "react-doctor/iframe-title-unique",
  "react-doctor/jsx-filename-extension",
  "react-doctor/jsx-fragments",
  "react-doctor/jsx-no-useless-fragment",
  "react-doctor/jsx-pascal-case",
  "react-doctor/loading-action-preserves-trigger",
  "react-doctor/no-auto-scrolling-content",
  "react-doctor/no-aria-hidden-on-body",
  "react-doctor/no-aria-invalid-without-description",
  "react-doctor/no-array-index-key",
  "react-doctor/no-clone-element",
  "react-doctor/no-collapse-request-error-to-empty-state",
  "react-doctor/no-dark-mode-glow",
  "react-doctor/no-danger",
  "react-doctor/no-decorative-radial-spotlight",
  "react-doctor/no-default-props",
  "react-doctor/no-disabled-zoom",
  "react-doctor/no-duplicate-static-id-reference",
  "react-doctor/no-focusable-content-in-role-text",
  "react-doctor/no-generic-handler-names",
  "react-doctor/no-gradient-text",
  "react-doctor/no-gray-on-colored-background",
  "react-doctor/no-inline-bounce-easing",
  "react-doctor/no-inline-exhaustive-style",
  "react-doctor/no-justified-text",
  "react-doctor/no-layout-transition-inline",
  "react-doctor/no-long-transition-duration",
  "react-doctor/no-nonresizable-textarea",
  "react-doctor/no-outline-none",
  "react-doctor/no-presentation-role-conflict",
  "react-doctor/no-prop-types",
  "react-doctor/no-pulsing-status-dot",
  "react-doctor/no-pure-black-background",
  "react-doctor/no-radial-halo",
  "react-doctor/no-react-children",
  "react-doctor/no-reduced-motion-content-removal",
  "react-doctor/no-repeated-container-text",
  "react-doctor/no-server-side-image-map",
  "react-doctor/no-set-state",
  "react-doctor/no-shape-assembled-illustration",
  "react-doctor/no-side-tab-border",
  "react-doctor/no-skipped-heading-level",
  "react-doctor/no-tiny-text",
  "react-doctor/no-unbounded-animation-frame-loop",
  "react-doctor/no-unescaped-entities",
  "react-doctor/no-ungated-tailwind-animation",
  "react-doctor/no-wide-letter-spacing",
  "react-doctor/no-z-index-9999",
  "react-doctor/prefer-es6-class",
  "react-doctor/prefer-function-component",
  "react-doctor/rn-animate-layout-property",
  "react-doctor/rn-bottom-sheet-no-ignored-scroll-prop",
  "react-doctor/rn-bottom-sheet-no-state-in-on-animate",
  "react-doctor/rn-bottom-sheet-use-integrated-scrollable",
  "react-doctor/rn-platform-shaking-use-direct-import",
  "react-doctor/rn-prefer-content-inset-adjustment",
  "react-doctor/rn-reanimated-4-no-legacy-spring-thresholds",
  "react-doctor/rn-reanimated-4-no-removed-api",
  "react-doctor/rn-reanimated-4-use-worklets-scheduler",
  "react-doctor/self-closing-comp",
  "react-doctor/shadcn-tabs-trigger-requires-list",
  "react-doctor/state-in-constructor",
  "react-doctor/tanstack-start-missing-scripts",
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
    const overrides = getRecordProperty(packageJson, "overrides");

    expect(devDependencies["react-doctor"]).toBe("0.9.2");
    expect(overrides["react-doctor"]).toBe("0.9.2");
  });

  test("uses the audited release for every locked React Doctor copy", () => {
    const bunLock = readFileSync(resolve(projectRoot, "bun.lock"), "utf8");
    const lockedVersions = new Set(
      Array.from(
        bunLock.matchAll(/\["react-doctor@(\d+\.\d+\.\d+)"/g),
        (match) => match[1]
      )
    );

    expect(lockedVersions).toEqual(new Set(["0.9.2"]));
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
  }, 10_000);

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

    expect(ignoredFiles).toEqual(requiredIgnoredFiles);
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
