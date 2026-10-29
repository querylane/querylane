import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { expect, test } from "@rstest/core";

test.each([
  { renderer: undefined },
  { renderer: "react" },
  { renderer: "redact" },
])(
  "canonical container isolates build output and forwards renderer $renderer",
  ({ renderer }) => {
    const directory = mkdtempSync(
      join(tmpdir(), "querylane-container-contract-")
    );
    const runtimeEnv = new Map(Object.entries(env));
    runtimeEnv.set("PATH", `${directory}:${runtimeEnv.get("PATH") ?? ""}`);
    if (renderer === undefined) {
      runtimeEnv.delete("QUERYLANE_RENDERER");
    } else {
      runtimeEnv.set("QUERYLANE_RENDERER", renderer);
    }
    try {
      writeFileSync(
        join(directory, "docker"),
        '#!/usr/bin/env bash\nprintf "%s\\n" "$@"\n',
        { mode: 0o755 }
      );
      const result = spawnSync(
        "bash",
        [
          join(import.meta.dirname, "playwright-container.sh"),
          "bun",
          "run",
          "test:visual",
        ],
        {
          cwd: new URL("../", import.meta.url),
          encoding: "utf8",
          env: Object.fromEntries(runtimeEnv),
          timeout: 30_000,
        }
      );
      expect(result.status).toBe(0);
      const args = result.stdout.trim().split("\n");
      const volumes = args.flatMap((argument, index) =>
        argument === "--volume" ? [args[index + 1]] : []
      );
      expect(volumes).toContain("/work/dist");
      const environment = args.flatMap((argument, index) =>
        argument === "--env" ? [args[index + 1]] : []
      );
      expect(environment).toContain(
        `QUERYLANE_RENDERER=${renderer ?? "react"}`
      );
    } finally {
      rmSync(directory, { recursive: true });
    }
  }
);

test("local E2E cannot silently reuse a server from another workspace", () => {
  const runtimeEnv = new Map(Object.entries(env));
  for (const name of ["CI", "BASE_URL", "PLAYWRIGHT_BASE_URL"]) {
    runtimeEnv.delete(name);
  }
  const result = spawnSync(
    "bun",
    [
      "--no-install",
      "-e",
      'import config from "./e2e/playwright.config.ts"; const server = config.webServer; if (!server || Array.isArray(server) || server.reuseExistingServer !== false) { throw new Error("Local E2E must own its server"); }',
    ],
    {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
      env: Object.fromEntries(runtimeEnv),
      timeout: 30_000,
    }
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});
