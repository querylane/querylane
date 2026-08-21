import { pluginTailwindcss } from "@rsbuild/plugin-tailwindcss";
import type { RstestConfig } from "@rstest/core";
import {
  createQuerylaneRstestBuildConfig,
  RSTEST_PROJECT_NAMES,
  RSTEST_SLOW_TEST_THRESHOLDS,
  RSTEST_TIMEOUTS,
} from "./rstest.shared";

type BrowserTheme = "dark" | "light";

export function createRstestBrowserConfig(browserTheme: BrowserTheme) {
  const buildConfig = createQuerylaneRstestBuildConfig();

  return {
    ...buildConfig,
    browser: {
      browser: "chromium",
      enabled: true,
      headless: true,
      provider: "playwright",
      providerOptions: {
        context: {
          colorScheme: browserTheme,
          reducedMotion: "reduce",
        },
      },
      viewport: { height: 1000, width: 1280 },
    },
    clearMocks: true,
    env: { PUBLIC_TEST_BROWSER_THEME: browserTheme },
    include: ["src/**/*.rstest-browser.{test,spec}.{ts,tsx}"],
    name: `${RSTEST_PROJECT_NAMES.browser}-${browserTheme}`,
    passWithNoTests: false,
    plugins: [...buildConfig.plugins, pluginTailwindcss()],
    setupFiles: ["./rstest.browser.setup.ts"],
    slowTestThreshold: RSTEST_SLOW_TEST_THRESHOLDS.browser,
    testTimeout: RSTEST_TIMEOUTS.browser,
  } satisfies RstestConfig;
}
