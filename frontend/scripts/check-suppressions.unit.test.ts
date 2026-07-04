import { describe, expect, test } from "vitest";
import { findSuppressionViolations } from "./check-suppressions";

describe("suppression guard", () => {
  test("reports suppression comments outside generated files", () => {
    const violations = findSuppressionViolations({
      files: ["/repo/src/app.ts", "/repo/src/protogen/generated.ts"],
      projectRoot: "/repo",
      readFile: (path) =>
        path.includes("protogen")
          ? `/* ${["eslint", "disable"].join("-")} */`
          : `// ${["biome", "ignore"].join("-")} lint/style/noDefaultExport: no`,
    });

    expect(violations).toEqual([
      {
        line: 1,
        path: "src/app.ts",
        pattern: ["biome", "ignore"].join("-"),
      },
    ]);
  });

  test("reports generated route tree suppressions", () => {
    expect(
      findSuppressionViolations({
        files: ["/repo/src/routeTree.gen.ts"],
        projectRoot: "/repo",
        readFile: () =>
          `/* ${["biome", "ignore", "all"].join("-")} lint: generated */\n// ${["@ts", "nocheck"].join("-")}`,
      })
    ).toEqual([
      {
        line: 1,
        path: "src/routeTree.gen.ts",
        pattern: ["biome", "ignore"].join("-"),
      },
      {
        line: 2,
        path: "src/routeTree.gen.ts",
        pattern: ["@ts", "nocheck"].join("-"),
      },
    ]);
  });

  test("reports suppression strings in JSON config files", () => {
    const violations = findSuppressionViolations({
      files: ["/repo/tsr.config.json"],
      projectRoot: "/repo",
      readFile: () =>
        JSON.stringify({
          routeTreeFileHeader: [
            `/* ${["biome", "ignore", "all"].join("-")} lint: generated */`,
            `// ${["@ts", "nocheck"].join("-")}`,
          ],
        }),
    });

    expect(violations).toEqual([
      {
        line: 1,
        path: "tsr.config.json",
        pattern: ["biome", "ignore"].join("-"),
      },
      {
        line: 1,
        path: "tsr.config.json",
        pattern: ["@ts", "nocheck"].join("-"),
      },
    ]);
  });
});
