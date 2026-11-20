import { expect, test } from "@rstest/core";
import { migrationViolations } from "./check-ui-sdk-migration";

const dependencies = {
  "@base-ui/react": "1.9.0",
  "@ui-sdk/core": "0.1.0-beta.13",
  "@ui-sdk/react": "0.1.0-beta.13",
};

test("accepts pinned Base UI foundations and SDK enhancements", () => {
  expect(
    migrationViolations(
      { dependencies },
      new Map([
        [
          "src/components/ui/button.tsx",
          'import { Button } from "@base-ui/react/button";',
        ],
      ])
    )
  ).toEqual([]);
});

test("rejects unpinned adapters, legacy dependencies, and feature imports", () => {
  expect(
    migrationViolations(
      {
        dependencies: {
          ...dependencies,
          "@ui-sdk/react": "^0.1.0-beta.13",
          cmdk: "1.1.1",
        },
      },
      new Map([["src/feature.tsx", 'import { Command } from "cmdk";']])
    )
  ).toEqual([
    "@ui-sdk/react must be pinned to 0.1.0-beta.13",
    "Remove replaced dependency cmdk",
    "src/feature.tsx still references cmdk",
  ]);
});

test("rejects missing manifests and legacy mock or dynamic import paths", () => {
  expect(
    migrationViolations(
      null,
      new Map([
        ["src/feature.test.tsx", "rs.mock('sonner', () => ({}))"],
        ["src/feature.tsx", 'const panels = import("react-resizable-panels")'],
      ])
    )
  ).toHaveLength(5);
});

test("rejects removing Base UI or replacing a core primitive with SDK components", () => {
  expect(
    migrationViolations(
      { dependencies: { ...dependencies, "@base-ui/react": undefined } },
      new Map()
    )
  ).toEqual(["@base-ui/react must be pinned to 1.9.0"]);
  expect(
    migrationViolations(
      { dependencies },
      new Map([
        [
          "src/components/ui/button.tsx",
          'import { Button } from "@ui-sdk/react/button";',
        ],
      ])
    )
  ).toEqual([
    "src/components/ui/button.tsx must keep Base UI as its foundation",
  ]);
});
