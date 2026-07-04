import { describe, expect, test } from "vitest";
import {
  baseRefFromEnvironment,
  changedRepoFiles,
  frontendRelativePath,
  lintableChangedFiles,
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

  test("lists changed files from committed trees without blob-hydrating rename checks", () => {
    const calls: { command: string; args: string[] }[] = [];
    const runner = {
      run: (command: string, args: string[]) => {
        calls.push({ args, command });
        if (args[0] === "merge-base") {
          return { status: 0, stdout: "abc123\n" };
        }
        if (args[0] === "diff") {
          return { status: 0, stdout: "frontend/src/app.tsx\n" };
        }
        return { status: 0, stdout: "" };
      },
    };

    expect(changedRepoFiles("origin/main", runner)).toEqual([
      "frontend/src/app.tsx",
    ]);

    const diffCall = calls.find((call) => call.args[0] === "diff");
    expect(diffCall?.args).toEqual([
      "diff",
      "--name-only",
      "--no-renames",
      "--diff-filter=ACMRTUXB",
      "abc123",
      "HEAD",
      "--",
      ":(top)frontend",
    ]);
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
});
