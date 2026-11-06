import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@rstest/core";

const bun = spawnSync("which", ["bun"], { encoding: "utf-8" }).stdout.trim();

test.each([{ output: "not JSON" }, { output: "{}" }])(
  "rejects a successful Doctor subprocess without a valid report: $output",
  ({ output }) => {
    const root = mkdtempSync(join(tmpdir(), "querylane-doctor-"));
    try {
      const bin = join(root, "bin");
      mkdirSync(bin);
      const stub = join(bin, "bun");
      writeFileSync(stub, `#!/bin/sh\nprintf '%s' '${output}'\n`);
      chmodSync(stub, 0o755);
      const result = spawnSync(
        bun,
        [join(import.meta.dirname, "run-react-doctor-ci.ts")],
        {
          cwd: root,
          encoding: "utf-8",
          env: { PATH: bin },
        }
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Could not parse React Doctor JSON output"
      );
    } finally {
      rmSync(root, { recursive: true });
    }
  }
);

test.each([
  { exitCode: 0, state: "success" },
  { exitCode: 1, state: "failure" },
])("publishes $state for Doctor exit $exitCode", ({ exitCode, state }) => {
  const root = mkdtempSync(join(tmpdir(), "querylane-doctor-status-"));
  try {
    const bin = join(root, "bin");
    mkdirSync(bin);
    const report = {
      ok: true,
      error: null,
      diagnostics:
        exitCode === 0
          ? []
          : [{ severity: "warning", message: "Blocking warning" }],
      summary: {
        errorCount: 0,
        warningCount: exitCode,
        affectedFileCount: exitCode,
        totalDiagnosticCount: exitCode,
      },
    };
    const stub = join(bin, "bun");
    writeFileSync(
      stub,
      `#!/bin/sh\nprintf '%s' '${JSON.stringify(report)}'\nexit ${exitCode}\n`
    );
    chmodSync(stub, 0o755);
    const event = join(root, "event.json");
    writeFileSync(
      event,
      JSON.stringify({ pull_request: { number: 1, head: { sha: "fixture" } } })
    );
    const status = join(root, "status.json");
    const preload = join(root, "github.mjs");
    writeFileSync(
      preload,
      `import { writeFileSync } from "node:fs";
globalThis.fetch = (url, init) => {
  if (url.includes("/statuses/")) writeFileSync(${JSON.stringify(status)}, init.body);
  return Promise.resolve(new Response(init.method === "GET" ? "[]" : "{}"));
};`
    );
    const result = spawnSync(
      bun,
      [
        "--preload",
        preload,
        join(import.meta.dirname, "run-react-doctor-ci.ts"),
      ],
      {
        cwd: root,
        encoding: "utf-8",
        env: {
          PATH: bin,
          GITHUB_API_URL: "http://127.0.0.1:1",
          GITHUB_TOKEN: "test-fixture-token",
          GITHUB_REPOSITORY: "fixture/repo",
          GITHUB_EVENT_PATH: event,
        },
      }
    );
    expect(result.status, result.stdout + result.stderr).toBe(exitCode);
    const published: unknown = JSON.parse(readFileSync(status, "utf8"));
    expect(published).toMatchObject({ state });
  } finally {
    rmSync(root, { recursive: true });
  }
});
