import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "@rstest/core";
import {
  baseRefFromEnvironment,
  changedRepoFiles,
  frontendRelativePath,
  lintableChangedFiles,
  requiresFullStaticAnalysis,
  requiresFullStaticAnalysisFromBase,
} from "./lint-changed";

const fileSystem = {
  existsSync: (path: string) => !path.includes("missing"),
  statSync: (path: string) => ({ isFile: () => !path.endsWith("/") }),
};

describe("changed-file lint selection", () => {
  test("uses the explicit quality base before GitHub and default bases", () => {
    expect(
      baseRefFromEnvironment({
        GITHUB_BASE_REF: "main",
        QUALITY_BASE_REF: "origin/release",
      })
    ).toBe("origin/release");
    expect(baseRefFromEnvironment({ GITHUB_BASE_REF: "main" })).toBe(
      "origin/main"
    );
    expect(baseRefFromEnvironment({})).toBe("origin/main");
  });

  test("normalizes repository paths to frontend-relative paths", () => {
    expect(frontendRelativePath("frontend/src/app.tsx")).toBe("src/app.tsx");
    expect(frontendRelativePath("src/app.tsx")).toBe("src/app.tsx");
    expect(frontendRelativePath("../backend/main.go")).toBeNull();
  });

  test("keeps lintable changed files and skips generated or registry files", () => {
    expect(
      lintableChangedFiles(
        [
          "frontend/src/app.tsx",
          "frontend/src/protogen/generated.ts",
          "frontend/src/components/ui/button.tsx",
          "frontend/src/routeTree.gen.ts",
          "frontend/README.md",
          "frontend/missing.ts",
          "backend/main.go",
        ],
        fileSystem
      )
    ).toEqual(["src/app.tsx"]);
  });

  test("discovers workflow policy changes through the git runner", () => {
    const calls: {
      command: string;
      args: string[];
    }[] = [];
    const runner = {
      run: (command: string, args: string[]) => {
        calls.push({ args, command });
        if (args[0] === "merge-base") {
          return { status: 0, stdout: "abc123\n" };
        }
        if (args[0] === "diff") {
          return {
            status: 0,
            stdout: ".github/workflows/frontend-ci.yml\0frontend/src/app.tsx\0",
          };
        }
        return { status: 0, stdout: "" };
      },
    };

    expect(requiresFullStaticAnalysisFromBase("origin/main", runner)).toBe(
      true
    );
    const diffCall = calls.find((call) => call.args[0] === "diff");
    expect(diffCall?.args).toContain(":(top).github/workflows/frontend-ci.yml");
    expect(diffCall?.args).toContain(":(top)biome.jsonc");
    expect(diffCall?.args).toContain("-z");
    expect(diffCall?.args).not.toContain("HEAD");
  });
});

test.each([
  "biome.jsonc",
  "bun.lock",
  "package.json",
  "frontend/quality/rule-inventory.json",
  "frontend/quality/rule-options.json",
  "frontend/scripts/check-rule-inventory.ts",
  "frontend/scripts/quality-boundaries.ts",
  "frontend/scripts/querylane-lint.config.ts",
  "frontend/scripts/quality-options.ts",
  "frontend/scripts/check-biome-compat.ts",
  "frontend/scripts/check-suppressions.ts",
])("runs full lint when policy changes: %s", (path) => {
  expect(requiresFullStaticAnalysis([path])).toBe(true);
});

test("includes additional authored language extensions", () => {
  const paths = ["mts", "cts", "yaml", "yml", "scss", "graphql", "gql"].map(
    (extension) => `src/example.${extension}`
  );
  expect(lintableChangedFiles(paths, fileSystem)).toEqual(paths);
});

test("discovers staged, unstaged and untracked paths without quoting or newline loss", () => {
  const root = mkdtempSync(join(tmpdir(), "querylane-changed-"));
  const run = (command: string, args: string[]) => {
    const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
    return { status: result.status, stdout: result.stdout };
  };
  const git = (...args: string[]) => {
    expect(run("git", args).status).toBe(0);
  };
  try {
    mkdirSync(join(root, "frontend"));
    git("init", "-b", "main");
    for (const path of ["staged.ts", "working.ts"]) {
      writeFileSync(join(root, "frontend", path), "original");
    }
    git("add", ".");
    git(
      "-c",
      "user.name=Quality Fixture",
      "-c",
      "user.email=quality@example.test",
      "commit",
      "-m",
      "fixture"
    );
    writeFileSync(join(root, "frontend/staged.ts"), "staged");
    git("add", "frontend/staged.ts");
    writeFileSync(join(root, "frontend/working.ts"), "working");
    writeFileSync(join(root, 'frontend/quoted"\npath.ts'), "untracked");
    writeFileSync(join(root, "biome.jsonc"), "{}");
    expect(changedRepoFiles("main", { run }).toSorted()).toEqual(
      [
        "biome.jsonc",
        'frontend/quoted"\npath.ts',
        "frontend/staged.ts",
        "frontend/working.ts",
      ].toSorted()
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
