import type { RstestConfig } from "@rstest/core";
import {
  createQuerylaneRstestBuildConfig,
  RSTEST_MAX_WORKERS,
  RSTEST_PROJECT_NAMES,
  RSTEST_SETUP_FILE,
  RSTEST_SLOW_TEST_THRESHOLDS,
  RSTEST_TIMEOUTS,
} from "./rstest.shared";

export default {
  ...createQuerylaneRstestBuildConfig(),
  clearMocks: true,
  include: ["src/**/*.integration.{test,spec}.{ts,tsx}"],
  name: RSTEST_PROJECT_NAMES.integration,
  passWithNoTests: false,
  pool: {
    maxWorkers: RSTEST_MAX_WORKERS,
    execArgv: ["--no-experimental-webstorage"],
    type: "threads",
  },
  setupFiles: [RSTEST_SETUP_FILE],
  slowTestThreshold: RSTEST_SLOW_TEST_THRESHOLDS.integration,
  testEnvironment: {
    name: "happy-dom",
    prebundle: "auto",
  },
  testTimeout: RSTEST_TIMEOUTS.integration,
} satisfies RstestConfig;
