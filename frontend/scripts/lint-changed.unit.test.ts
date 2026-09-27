import { describe, expect, test } from "@rstest/core";
import {
  baseRefFromEnvironment,
  frontendRelativePath,
  lintableChangedFiles,
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
    const calls: { command: string; args: string[] }[] = [];
    const runner = {
      run: (command: string, args: string[]) => {
        calls.push({ args, command });
        if (args[0] === "merge-base") {
          return { status: 0, stdout: "abc123\n" };
        }
        if (args[0] === "diff") {
          return {
            status: 0,
            stdout: ".github/workflows/frontend-ci.yml\nfrontend/src/app.tsx\n",
          };
        }
        return { status: 0, stdout: "" };
      },
    };

    expect(requiresFullStaticAnalysisFromBase("origin/main", runner)).toBe(
      true
    );
    const diffCall = calls.find((call) => call.args[0] === "diff");
    expect(diffCall?.args.slice(-2)).toEqual([
      ":(top)frontend",
      ":(top).github/workflows/frontend-ci.yml",
    ]);
  });
});
