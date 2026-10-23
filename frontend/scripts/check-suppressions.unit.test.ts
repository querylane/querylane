import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "@rstest/core";
import { findSuppressionViolations } from "./check-suppressions";

describe("suppression guard", () => {
  test("rejects generated headers on authored files", () => {
    const violations = findSuppressionViolations({
      files: ["/repo/src/escape.ts"],
      projectRoot: "/repo",
      readFile: () =>
        `// ${["DO NOT", "EDIT"].join(" ")}\nexport const value = 1;`,
    });
    expect(violations.map((violation) => violation.pattern)).toContain(
      "generated header outside generated source"
    );
  });
  test("does not mistake rule ids or documentation links for opt-out directives", () => {
    expect(
      findSuppressionViolations({
        files: ["/repo/quality/rule-inventory.json"],
        projectRoot: "/repo",
        readFile: () =>
          JSON.stringify({
            rule: `unicorn/no-abusive-${["eslint", "disable"].join("-")}`,
            docs: `https://biomejs.dev/linter/rules/use-${["biome", "ignore", "folder"].join("-")}/`,
          }),
      })
    ).toEqual([]);
  });
  test("rejects generated-looking authored files and nested quality configs", () => {
    const violations = findSuppressionViolations({
      files: [
        "/repo/src/escape.gen.ts",
        "/repo/src/biome.json",
        "/repo/src/oxlint.config.ts",
      ],
      projectRoot: "/repo",
      readFile: () => "export {};",
    });
    expect(violations.map((violation) => violation.path)).toEqual([
      "src/escape.gen.ts",
      "src/biome.json",
      "src/oxlint.config.ts",
    ]);
  });

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

describe("suppression check file coverage", () => {
  test("rejects directives in modules, hidden tooling, and new source directories", () => {
    const root = mkdtempSync(join(tmpdir(), "querylane-suppressions-"));
    for (const directory of [
      "e2e",
      "scripts",
      "src",
      "test",
      ".storybook",
      "quality",
    ]) {
      mkdirSync(join(root, directory));
    }
    const check = () =>
      spawnSync("bun", [join(import.meta.dirname, "check-suppressions.ts")], {
        cwd: root,
        encoding: "utf-8",
      });
    const directive = `// ${["@ts", "nocheck"].join("-")}`;
    try {
      for (const file of [
        "src/escape.mts",
        "src/escape.cts",
        ".storybook/preview.ts",
        "quality/check.ts",
      ]) {
        writeFileSync(join(root, file), directive);
        expect(check().status).toBe(1);
        writeFileSync(join(root, file), "export {};\n");
      }
      expect(check().status).toBe(0);
    } finally {
      rmSync(root, { recursive: true });
    }
  });
});

describe("suppression guard file-system bypasses", () => {
  test("rejects extensionless ignores and source symlinks", () => {
    const root = mkdtempSync(join(tmpdir(), "querylane-quality-"));
    const check = () =>
      spawnSync("bun", [join(import.meta.dirname, "check-suppressions.ts")], {
        cwd: root,
        encoding: "utf-8",
      });
    try {
      mkdirSync(join(root, "src"));
      writeFileSync(join(root, ".oxlintignore"), "src/**");
      expect(check().status).toBe(1);
      unlinkSync(join(root, ".oxlintignore"));
      writeFileSync(join(root, "real.ts"), "export {};\n");
      symlinkSync(join(root, "real.ts"), join(root, "src", "escape.ts"));
      expect(check().status).toBe(1);
      unlinkSync(join(root, "src", "escape.ts"));
      expect(check().status).toBe(0);
    } finally {
      rmSync(root, { recursive: true });
    }
  });
});

describe("suppression guard artifact coverage", () => {
  test("rejects nested reserved artifact directories even without directives", () => {
    const root = mkdtempSync(join(tmpdir(), "querylane-artifacts-"));
    const check = () =>
      spawnSync("bun", [join(import.meta.dirname, "check-suppressions.ts")], {
        cwd: root,
        encoding: "utf-8",
      });
    const directive = `// ${["@ts", "nocheck"].join("-")}`;
    try {
      mkdirSync(join(root, "dist"));
      writeFileSync(join(root, "dist", "bundle.js"), directive);
      expect(check().status).toBe(0);
      for (const name of [
        "coverage",
        "build",
        "dist",
        "node_modules",
        "opensrc",
      ]) {
        const nested = join(root, "src", name);
        mkdirSync(nested, { recursive: true });
        writeFileSync(join(nested, "escape.ts"), "export const hidden = 1;\n");
        expect(check().status).toBe(1);
        rmSync(nested, { recursive: true });
      }
    } finally {
      rmSync(root, { recursive: true });
    }
  });
});
