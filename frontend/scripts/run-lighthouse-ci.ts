#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process, { env } from "node:process";
import { chromium } from "playwright";

const FRONTEND_ROOT = join(import.meta.dirname, "..");
const LOCAL_LHCI_BIN = join(
  FRONTEND_ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "lhci.cmd" : "lhci"
);
const LIGHTHOUSE_CONFIG_PATH = join(FRONTEND_ROOT, "lighthouserc.cjs");
const FAILURE_EXIT_CODE = 1;

function getChromePath() {
  return env["CHROME_PATH"]?.trim() || chromium.executablePath();
}

function runLighthouseCi() {
  const lhciBin = existsSync(LOCAL_LHCI_BIN) ? LOCAL_LHCI_BIN : "lhci";
  const result = spawnSync(
    lhciBin,
    ["autorun", "--config", LIGHTHOUSE_CONFIG_PATH],
    {
      cwd: FRONTEND_ROOT,
      env: {
        ...env,
        CHROME_PATH: getChromePath(),
      },
      stdio: "inherit",
    }
  );

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
