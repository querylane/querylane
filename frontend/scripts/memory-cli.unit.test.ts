import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@rstest/core";

const ROOT = resolve(import.meta.dirname, "..");
const CLI = join(ROOT, "scripts/run-memory-lifecycle.ts");

test("real CLI missing prerequisites exit nonzero and persist invalid rather than successful empty evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "memory-cli-"));
  const output = join(directory, "report");
  const run = spawnSync(
    "bun",
    [
      CLI,
      "--url",
      "http://127.0.0.1:4173",
      "--build-manifest",
      join(directory, "missing.json"),
      "--output-dir",
      output,
    ],
    { cwd: ROOT, encoding: "utf8", timeout: 5000 }
  );
  try {
    expect(run.status, run.stderr).toBe(1);
    expect(run.stdout).toContain('"status":"invalid-collection"');
    const report = readFileSync(join(output, "memory-report.json"), "utf8");
    expect(report).toContain('"collection": null');
    expect(report).toContain("ENOENT");
    // Reusing the same output directory cannot overwrite or satisfy a second run.
    const repeated = spawnSync(
      "bun",
      [
        CLI,
        "--url",
        "http://127.0.0.1:4173",
        "--build-manifest",
        join(directory, "missing.json"),
        "--output-dir",
        output,
      ],
      { cwd: ROOT, encoding: "utf8", timeout: 5000 }
    );
    expect(repeated.status).toBe(1);
    expect(readFileSync(join(output, "memory-report.json"), "utf8")).toBe(
      report
    );
  } finally {
    unlinkSync(join(output, "memory-report.json"));
    rmdirSync(output);
    rmdirSync(directory);
  }
});
