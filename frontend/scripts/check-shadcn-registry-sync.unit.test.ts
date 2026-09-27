import { describe, expect, rs, test } from "@rstest/core";
import {
  isCnImportOnlyShadcnDiff,
  readPinnedShadcnPackageSpecifier,
  runShadcnRegistrySyncCheck,
} from "./check-shadcn-registry-sync";

const PINNED_SHADCN_SPECIFIER_PATTERN = /^shadcn@\d+\.\d+\.\d+/u;

function mockExpectedConsoleError() {
  return rs.spyOn(console, "error").mockImplementation(() => undefined);
}

describe("shadcn registry sync check", () => {
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

  test("treats the registry's cn package import swap as no drift", () => {
    expect(
      isCnImportOnlyShadcnDiff(`├ src/components/ui/input-group.tsx (overwrite)
│ ┌──────────────────────────────────────────────
│ │ --- a/src/components/ui/input-group.tsx
│ │ +++ b/src/components/ui/input-group.tsx
│ │ @@ -2,8 +2,8 @@
│ │  
│ │  import * as React from "react"
│ │  import { cva, type VariantProps } from "class-variance-authority"
│ │ +import { cn } from "cn"
│ │  
│ │ -import { cn } from "@/lib/utils"
│ │  import { Button } from "@/components/ui/button"
│ └──────────────────────────────────────────────`)
    ).toBe(true);
    expect(
      isCnImportOnlyShadcnDiff(`├ src/components/ui/accordion.tsx (overwrite)
│ │ @@ -1,6 +1,5 @@
│ │  import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"
│ │ -
│ │ +import { cn } from "cn"
│ │ -import { cn } from "@/lib/utils"
│ │  import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"
│ └──────────────────────────────────────────────
│
├ Dependencies (1)
│ + cn
│
└ Run without --dry-run to apply.`)
    ).toBe(true);
  });

  test("fails when allowlisted and non-allowlisted drift are mixed", () => {
    const consoleError = mockExpectedConsoleError();
    const runner = {
      run: (_command: string, args: readonly string[]) => {
        if (args.includes("info")) {
          return {
            status: 0,
            stderr: "",
            stdout: JSON.stringify({ components: ["sonner", "button"] }),
          };
        }

        return {
          status: 0,
          stderr: "",
          stdout: `├ Files (2) ~2 overwrite
│ ~ src/components/ui/sonner.tsx overwrite
│ ~ src/components/ui/button.tsx overwrite`,
        };
      },
    };

    expect(runShadcnRegistrySyncCheck({ runner })).toBe(1);
    expect(consoleError).toHaveBeenCalled();
  });

  test("fails when shadcn info returns no registry components", () => {
    const consoleError = mockExpectedConsoleError();
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
    expect(consoleError).toHaveBeenCalled();
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
