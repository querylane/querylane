import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@rstest/core";

const changedComponents = `├ Files (2) ~2 overwrite
│ ~ src/components/ui/sonner.tsx overwrite
│ ~ src/components/ui/button.tsx overwrite`;

test.each([
  {
    name: "allows the registry's cn package migration",
    summary: changedComponents,
    diff: `│ │ -import { cn } from "@/lib/utils"
│ │ +import { cn } from "cn"
│ + cn`,
    status: 0,
    message: "shadcn registry sync check passed",
  },
  {
    name: "rejects real drift mixed with allowlisted files",
    summary: changedComponents,
    diff: '│ │ +const display = "changed";',
    status: 1,
    message: "- src/components/ui/button.tsx",
  },
  {
    name: "fails closed when registry output can't be parsed",
    summary:
      "├ Files (1) ~1 overwrite\n│ ? src/components/ui/button.tsx overwrite",
    diff: "",
    status: 1,
    message: "Parsed 0 overwrite file(s), but shadcn reported 1",
  },
  {
    name: "fails closed when discovery returns no components",
    components: [],
    summary: "",
    diff: "",
    status: 1,
    message: "shadcn info returned zero components",
  },
])(
  "registry preflight $name",
  ({ components, summary, diff, status, message }) => {
    const root = mkdtempSync(join(tmpdir(), "querylane-registry-"));
    try {
      const bin = join(root, "node_modules/.bin");
      mkdirSync(bin, { recursive: true });
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({ devDependencies: { shadcn: "1.0.0" } })
      );
      writeFileSync(
        join(bin, "shadcn"),
        `const args = process.argv.slice(2);
if (args.join(" ") === "info --json") {
  console.log(JSON.stringify({ components: ${JSON.stringify(components ?? ["sonner", "button"])} }));
} else if (args.join(" ") === "add button sonner --dry-run") {
  console.log(${JSON.stringify(summary)});
} else if (args.join(" ") === "add button sonner --diff src/components/ui/button.tsx") {
  console.log(${JSON.stringify(diff)});
} else {
  process.exitCode = 1;
}`
      );
      const result = spawnSync(
        "bun",
        [join(import.meta.dirname, "check-shadcn-registry-sync.ts")],
        { cwd: root, encoding: "utf8" }
      );
      expect(result.status, result.stdout + result.stderr).toBe(status);
      expect(result.stdout + result.stderr).toContain(message);
    } finally {
      rmSync(root, { recursive: true });
    }
  }
);
