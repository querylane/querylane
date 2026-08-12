import path from "node:path";
import { pluginReact } from "@rsbuild/plugin-react";

export const RSTEST_TIMEOUTS = {
  integration: 5000,
  unit: 3000,
} as const;

export const RSTEST_SLOW_TEST_THRESHOLDS = {
  integration: 100,
  unit: 50,
} as const;

export const RSTEST_SETUP_FILE = "./rstest.setup.ts";

export const RSTEST_PROJECT_NAMES = {
  integration: "integration",
  unit: "unit",
} as const;

export function createQuerylaneRstestBuildConfig() {
  return {
    plugins: [pluginReact({ reactCompiler: false })],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
  };
}
