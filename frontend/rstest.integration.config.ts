import type { RstestConfig } from "@rstest/core";
import {
  createQuerylaneRstestDomConfig,
  RSTEST_MAX_WORKERS,
  RSTEST_PROJECT_NAMES,
  RSTEST_SLOW_TEST_THRESHOLDS,
  RSTEST_TIMEOUTS,
} from "./rstest.shared";

export default {
  ...createQuerylaneRstestDomConfig(),
  clearMocks: true,
  include: ["src/**/*.integration.{test,spec}.{ts,tsx}"],
  name: RSTEST_PROJECT_NAMES.integration,
  passWithNoTests: false,
  pool: {
    maxWorkers: RSTEST_MAX_WORKERS,
    execArgv: ["--no-experimental-webstorage"],
    type: "threads",
  },
  slowTestThreshold: RSTEST_SLOW_TEST_THRESHOLDS.integration,
  testTimeout: RSTEST_TIMEOUTS.integration,
} satisfies RstestConfig;
