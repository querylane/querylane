import { spawnSync } from "node:child_process";
import { env } from "node:process";
import { expect, test } from "@rstest/core";

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
