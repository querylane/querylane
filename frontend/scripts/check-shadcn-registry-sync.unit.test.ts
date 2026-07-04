import { describe, expect, test } from "vitest";
import {
  findExpectedShadcnOverwriteCount,
  findShadcnOverwriteFiles,
  isNoChangeShadcnDiff,
  normalizeShadcnComponents,
  parseShadcnInfoComponents,
  readPinnedShadcnPackageSpecifier,
  runShadcnRegistrySyncCheck,
} from "./check-shadcn-registry-sync";

const PINNED_SHADCN_SPECIFIER_PATTERN = /^shadcn@\d+\.\d+\.\d+/u;

describe("shadcn registry sync check", () => {
  test("parses installed registry components from shadcn info JSON", () => {
    expect(
      parseShadcnInfoComponents(
        `Tip: use {name} in docs\n{"components":["button","card"]}`
      )
    ).toEqual(["button", "card"]);
  });

  test("reports files shadcn would overwrite from real dry-run shape", () => {
    const output = `
┌ shadcn add button, card (dry run)
│
├ Files (3) ~2 overwrite, =1 skip
\u001b[36m│\u001b[39m \u001b[33m~\u001b[39m src/components/ui/button.tsx  overwrite
│ = src/components/ui/card.tsx    skip (identical)
│ ~ src/hooks/use-mobile.ts       overwrite
└ Run without --dry-run to apply.
`;

    expect(findShadcnOverwriteFiles(output)).toEqual([
      "src/components/ui/button.tsx",
      "src/hooks/use-mobile.ts",
    ]);
    expect(findExpectedShadcnOverwriteCount(output)).toBe(2);
  });

  test("runs the package-pinned shadcn version", () => {
    let infoCommand = "";
    let infoArgs: readonly string[] = [];
    const runner = {
      run: (command: string, args: readonly string[]) => {
        if (args.includes("info")) {
          infoCommand = command;
          infoArgs = args;
          return {
            status: 0,
            stderr: "",
            stdout: JSON.stringify({ components: ["button"] }),
          };
        }

        return {
          status: 0,
          stderr: "",
          stdout: "├ Files (1) =1 skip",
        };
      },
    };

    expect(runShadcnRegistrySyncCheck({ runner })).toBe(0);
    expect(infoCommand).toBe("bun");
    expect(infoArgs).toContain("node_modules/.bin/shadcn");
    expect(readPinnedShadcnPackageSpecifier()).toMatch(
      PINNED_SHADCN_SPECIFIER_PATTERN
    );
    expect(infoArgs).not.toContain("shadcn@latest");
  });

  test("sorts and dedupes registry components before dry-run", () => {
    expect(normalizeShadcnComponents(["sonner", "button", "sonner"])).toEqual([
      "button",
      "sonner",
    ]);
  });

  test("recognizes no-change file diffs", () => {
    expect(
      isNoChangeShadcnDiff(`├ src/components/ui/command.tsx (skip)
│ No changes.`)
    ).toBe(true);
  });

  test("allows only known strict TypeScript compatibility patches", () => {
    const runner = {
      run: (_command: string, args: readonly string[]) => {
        if (args.includes("info")) {
          return {
            status: 0,
            stderr: "",
            stdout: JSON.stringify({ components: ["calendar", "sonner"] }),
          };
        }

        return {
          status: 0,
          stderr: "",
          stdout: `├ Files (2) ~2 overwrite
│ ~ src/components/ui/calendar.tsx overwrite
│ ~ src/components/ui/sonner.tsx overwrite`,
        };
      },
    };

    expect(runShadcnRegistrySyncCheck({ runner })).toBe(0);
  });

  test("fails on non-allowlisted registry drift", () => {
    let diffFile: string | undefined;
    const runner = {
      run: (_command: string, args: readonly string[]) => {
        if (args.includes("info")) {
          return {
            status: 0,
            stderr: "",
            stdout: JSON.stringify({ components: ["button"] }),
          };
        }

        if (args.includes("--diff")) {
          diffFile = args.at(-1);
          return {
            status: 0,
            stderr: "",
            stdout: "- custom button drift",
          };
        }

        return {
          status: 0,
          stderr: "",
          stdout: `├ Files (1) ~1 overwrite
│ ~ src/components/ui/button.tsx overwrite`,
        };
      },
    };

    expect(runShadcnRegistrySyncCheck({ runner })).toBe(1);
    expect(diffFile).toBe("src/components/ui/button.tsx");
  });

  test("ignores a dry-run overwrite when the file diff has no changes", () => {
    const runner = {
      run: (_command: string, args: readonly string[]) => {
        if (args.includes("info")) {
          return {
            status: 0,
            stderr: "",
            stdout: JSON.stringify({ components: ["command"] }),
          };
        }

        if (args.includes("--diff")) {
          return {
            status: 0,
            stderr: "",
            stdout: `├ src/components/ui/command.tsx (skip)
│ No changes.`,
          };
        }

        return {
          status: 0,
          stderr: "",
          stdout: `├ Files (1) ~1 overwrite
│ ~ src/components/ui/command.tsx overwrite`,
        };
      },
    };

    expect(runShadcnRegistrySyncCheck({ runner })).toBe(0);
  });

  test("fails when allowlisted and non-allowlisted drift are mixed", () => {
    const runner = {
      run: (_command: string, args: readonly string[]) => {
        if (args.includes("info")) {
          return {
            status: 0,
            stderr: "",
            stdout: JSON.stringify({ components: ["calendar", "button"] }),
          };
        }

        return {
          status: 0,
          stderr: "",
          stdout: `├ Files (2) ~2 overwrite
│ ~ src/components/ui/calendar.tsx overwrite
│ ~ src/components/ui/button.tsx overwrite`,
        };
      },
    };

    expect(runShadcnRegistrySyncCheck({ runner })).toBe(1);
  });

  test("fails when shadcn info returns no registry components", () => {
    const runner = {
      run: (_command: string, args: readonly string[]) => {
        if (args.includes("info")) {
          return {
            status: 0,
            stderr: "",
            stdout: JSON.stringify({ components: [] }),
          };
        }

        throw new Error("dry run should not execute");
      },
    };

    expect(runShadcnRegistrySyncCheck({ runner })).toBe(1);
  });

  test("fails closed when dry-run summary and parsed overwrites disagree", () => {
    const runner = {
      run: (_command: string, args: readonly string[]) => {
        if (args.includes("info")) {
          return {
            status: 0,
            stderr: "",
            stdout: JSON.stringify({ components: ["button"] }),
          };
        }

        return {
          status: 0,
          stderr: "",
          stdout: `├ Files (1) ~1 overwrite
│ ? src/components/ui/button.tsx overwrite`,
        };
      },
    };

    expect(() => runShadcnRegistrySyncCheck({ runner })).toThrow(
      "Parsed 0 overwrite file(s), but shadcn reported 1"
    );
  });
});
