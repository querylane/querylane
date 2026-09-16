import { spawnSync } from "node:child_process";
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "@rstest/core";
import { z } from "zod";

const projectRoot = resolve(import.meta.dirname, "..");
const reportSchema = z.object({
  diagnostics: z.array(
    z.object({ code: z.string(), filename: z.string(), severity: z.string() })
  ),
});

describe("shadcn lint command", () => {
  test("rejects every shadcn violation while accepting variants and layout", () => {
    const directory = mkdtempSync(resolve(projectRoot, ".shadcn-lint-test-"));
    const invalid = resolve(directory, "invalid.tsx");
    const valid = resolve(directory, "valid.tsx");
    try {
      writeFileSync(
        invalid,
        `import { Button } from "@/components/ui/button";
export function Invalid({ className }: { className: string }) {
  return <>
    <Button className="p-4">Restyled</Button>
    <Button className="bg-red-500">Raw color</Button>
    <Button className="p-[13px]">Arbitrary value</Button>
    <Button style={{ padding: 12 }}>Inline style</Button>
    <Button className="not-a-tailwind-class">Unknown class</Button>
    <Button className={"bg-" + className}>Dynamic class</Button>
  </>;
}`
      );
      writeFileSync(
        valid,
        `import { Button } from "@/components/ui/button";
export function Valid() {
  return <Button variant="outline" size="sm" className="mt-4 w-full">Save</Button>;
}`
      );
      const result = spawnSync(
        "bun",
        ["run", "lint:shadcn", "--format", "json", invalid, valid],
        { cwd: projectRoot, encoding: "utf8", timeout: 20_000 }
      );

      expect(result.error).toBeUndefined();
      expect(result.stderr).not.toContain("Script not found");
      expect(result.status).toBe(1);
      const report = reportSchema.parse(JSON.parse(result.stdout));
      expect(
        [...new Set(report.diagnostics.map(({ code }) => code))].sort()
      ).toEqual([
        "shadcn(no-arbitrary-values)",
        "shadcn(no-inline-styles)",
        "shadcn(no-raw-colors)",
        "shadcn(no-restyle)",
        "shadcn(no-unknown-classes)",
        "shadcn(require-static-classes)",
      ]);
      expect(
        report.diagnostics.every(({ severity }) => severity === "error")
      ).toBe(true);
      expect(
        report.diagnostics.every(({ filename }) =>
          filename.endsWith("invalid.tsx")
        )
      ).toBe(true);
    } finally {
      unlinkSync(invalid);
      unlinkSync(valid);
      rmdirSync(directory);
    }
  }, 30_000);
});
