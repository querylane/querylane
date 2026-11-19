import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@rstest/core";
import { z } from "zod";

const frontend = resolve(import.meta.dirname, "..");
const diagnosticSchema = z.object({
  diagnostics: z.array(z.object({ code: z.string() })),
});

test("the real Oxlint configuration runs all four Landmines plugins and typed checks", () => {
  const directory = mkdtempSync(join(tmpdir(), "querylane-rule-contracts-"));
  function lint(name: string, source: string) {
    const file = join(directory, name);
    writeFileSync(file, source);
    writeFileSync(
      join(directory, "tsconfig.json"),
      JSON.stringify({
        extends: join(frontend, "tsconfig.json"),
        files: [file],
        include: [],
        references: [],
      })
    );
    return spawnSync(
      join(frontend, "node_modules/.bin/oxlint"),
      [
        "--config",
        join(frontend, "oxlint.config.ts"),
        "--type-aware",
        "--deny-warnings",
        "--disable-nested-config",
        "--format",
        "json",
        file,
      ],
      { cwd: directory, encoding: "utf8" }
    );
  }

  try {
    symlinkSync(
      join(frontend, "node_modules"),
      join(directory, "node_modules"),
      "dir"
    );
    const invalid = lint(
      "probe.spec.ts",
      `import { setTimeout as sleep } from "node:timers/promises";
import { test } from "@rstest/core";

// Wait and assume completion.
export function run(work: () => Promise<unknown>): void {
  work();
}

test("waits for work", async () => {
  await sleep(50);
});`
    );
    expect(invalid.status, invalid.stdout + invalid.stderr).toBe(1);
    const report = diagnosticSchema.parse(JSON.parse(invalid.stdout));
    expect(report.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "landmines-structure(test-file-names)",
        "landmines-style(no-comments)",
        "landmines-testing(no-fixed-sleep)",
        "landmines-types(no-explicit-return-types)",
        "typescript(no-floating-promises)",
      ])
    );

    const valid = lint(
      "probe.unit.test.ts",
      `export async function run(ready: Promise<void>) {
  await ready;
  return 1;
}`
    );
    expect(valid.status, valid.stdout + valid.stderr).toBe(0);
  } finally {
    rmSync(directory, { recursive: true });
  }
});
