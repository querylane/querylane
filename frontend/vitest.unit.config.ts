import { defineConfig } from "vitest/config";
import { VITEST_PROJECT_NAMES } from "./vitest.projects";
import {
  createVitestBaseConfig,
  VITEST_SETUP_FILES,
  VITEST_SLOW_TEST_THRESHOLDS,
  VITEST_TIMEOUTS,
} from "./vitest.shared";

export default defineConfig({
  ...createVitestBaseConfig(),
  test: {
    environment: "happy-dom",
    exclude: ["node_modules/**"],
    // Disable Node process-level Web Storage so happy-dom owns per-test storage.
    // Node 24 recognizes the long experimental flag; newer Node versions keep it as an alias.
    execArgv: ["--no-experimental-webstorage"],
    include: [
      "scripts/**/*.unit.{test,spec}.{ts,tsx}",
      "src/**/*.unit.{test,spec}.{ts,tsx}",
    ],
    name: VITEST_PROJECT_NAMES.unit,
    passWithNoTests: false,
    setupFiles: VITEST_SETUP_FILES.dom,
    slowTestThreshold: VITEST_SLOW_TEST_THRESHOLDS.unit,
    testTimeout: VITEST_TIMEOUTS.unit,
  },
});
