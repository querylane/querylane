import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { expect, test } from "@rstest/core";

test.each([
  { paths: [".github/workflows/frontend-browser-smoke.yml"], expected: true },
  { paths: [".github/workflows/frontend-lighthouse.yml"], expected: true },
  { paths: ["frontend/src/a file.tsx"], expected: true },
  { paths: ["README.md"], expected: true },
  { paths: ["backend/engine/postgres.go"], expected: false },
  { paths: [], expected: false },
])("required frontend jobs detect changed paths: %j", ({ paths, expected }) => {
  const result = spawnSync(
    "bash",
    [join(import.meta.dirname, "frontend-changes.sh")],
    {
      input: paths.length > 0 ? `${paths.join("\0")}\0` : "",
      encoding: "utf8",
    }
  );
  expect(result.status).toBe(0);
  expect(result.stdout).toBe(`frontend=${String(expected)}\n`);
});
