import { expect, test } from "@rstest/core";
import { migrationViolations } from "./check-ui-sdk-migration";

const dependencies = {
  "@ui-sdk/core": "0.1.0-beta.2",
  "@ui-sdk/react": "0.1.0-beta.2",
};

test("accepts pinned sdk packages and migrated imports", () => {
  expect(
    migrationViolations(
      { dependencies },
      new Map([
        ["src/button.tsx", 'import { Button } from "@ui-sdk/react/button";'],
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
          "@ui-sdk/react": "^0.1.0-beta.2",
          cmdk: "1.1.1",
        },
      },
      new Map([
        ["src/feature.tsx", 'import { Menu } from "@base-ui/react/menu";'],
      ])
    )
  ).toEqual([
    "@ui-sdk/react must be pinned to 0.1.0-beta.2",
    "Remove replaced dependency cmdk",
    "src/feature.tsx still references @base-ui/react",
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
  ).toHaveLength(4);
});
