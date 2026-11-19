import { defineInlineProject, type RstestConfig } from "@rstest/core";
import {
  createQuerylaneRstestBuildConfig,
  RSTEST_DOM_ENVIRONMENT,
  RSTEST_MAX_WORKERS,
  RSTEST_PROJECT_NAMES,
  RSTEST_SETUP_FILE,
  RSTEST_SLOW_TEST_THRESHOLDS,
} from "./rstest.shared";

const transportTest = "src/lib/transport.integration.test.ts";

export default {
  clearMocks: true,
  name: RSTEST_PROJECT_NAMES.integration,
  passWithNoTests: false,
  pool: {
    maxWorkers: RSTEST_MAX_WORKERS,
    execArgv: ["--no-experimental-webstorage"],
    type: "threads",
  },
  projects: [
    defineInlineProject({
      ...createQuerylaneRstestBuildConfig(),
      exclude: [transportTest],
      include: ["src/**/*.integration.test.{ts,tsx}"],
      name: "integration-dom",
      setupFiles: [RSTEST_SETUP_FILE],
      testEnvironment: RSTEST_DOM_ENVIRONMENT,
    }),
    defineInlineProject({
      ...createQuerylaneRstestBuildConfig(),
      include: [transportTest],
      name: "integration-node",
      testEnvironment: "node",
    }),
  ],
  slowTestThreshold: RSTEST_SLOW_TEST_THRESHOLDS.integration,
} satisfies RstestConfig;
