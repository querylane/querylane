import path from "node:path";
import { env } from "node:process";
import { pluginReact } from "@rsbuild/plugin-react";
import packageJson from "./package.json" with { type: "json" };
import { resolveReactPerformanceMode } from "./scripts/react-performance-mode";

export const RSTEST_MAX_WORKERS = 4;

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
  const mode = resolveReactPerformanceMode({ env, isProduction: false });
  return {
    performance: {
      buildCache: {
        buildDependencies: [
          path.resolve(import.meta.dirname, "bun.lock"),
          path.resolve(import.meta.dirname, "package.json"),
          ...Object.values(packageJson.patchedDependencies).map((patch) =>
            path.resolve(import.meta.dirname, patch)
          ),
        ],
        cacheDigest: [mode.buildCacheKey],
      },
    },
    plugins: [pluginReact({ reactCompiler: false })],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
        ...mode.aliases,
      },
    },
  };
}
