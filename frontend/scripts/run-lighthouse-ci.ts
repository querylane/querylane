#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import process, { env } from "node:process";
import { chromium } from "playwright";

const FRONTEND_ROOT = join(import.meta.dirname, "..");
const FAILURE_EXIT_CODE = 1;

function getChromePath() {
  const { CHROME_PATH: chromePath } = env;
  return chromePath?.trim() || chromium.executablePath();
}

function runLighthouseCi() {
  const result = spawnSync("bun", ["run", "lighthouse:autorun"], {
    cwd: FRONTEND_ROOT,
    env: {
      ...env,
      CHROME_PATH: getChromePath(),
    },
    stdio: "inherit",
  });

  if (typeof result.status === "number") {
    return result.status;
  }

  if (result.error) {
    console.error(result.error.message);
  }

  return FAILURE_EXIT_CODE;
}

if (import.meta.main) {
  process.exit(runLighthouseCi());
}

export { getChromePath, runLighthouseCi };
