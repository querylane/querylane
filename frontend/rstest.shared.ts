import path from "node:path";
import { pluginReact } from "@rsbuild/plugin-react";

export const RSTEST_TIMEOUTS = {
  browser: 10_000,
  integration: 5000,
  unit: 3000,
} as const;

export const RSTEST_SLOW_TEST_THRESHOLDS = {
  browser: 250,
  integration: 100,
  unit: 50,
} as const;

export const RSTEST_SETUP_FILE = "./rstest.setup.ts";

export const RSTEST_PROJECT_NAMES = {
  browser: "browser-rstest",
  integration: "integration",
  unit: "unit",
} as const;

export function createQuerylaneRstestBuildConfig() {
  return {
    performance: {
      buildCache: true,
    },
    plugins: [pluginReact({ reactCompiler: false })],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
  };
}
