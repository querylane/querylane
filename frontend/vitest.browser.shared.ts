import process from "node:process";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { getBrowserPolicy } from "./vitest.browser-policy";
import { VITEST_PROJECT_NAMES } from "./vitest.projects";
import {
  createVitestBaseConfig,
  VITEST_BROWSER_OPTIMIZE_DEPS,
  VITEST_SETUP_FILES,
  VITEST_SLOW_TEST_THRESHOLDS,
  VITEST_TIMEOUTS,
} from "./vitest.shared";

type BrowserTheme = "light" | "dark";

const CANONICAL_SCREENSHOT_PLATFORM = "linux";
const CANONICAL_SCREENSHOT_MISMATCH_THRESHOLD = 0.02;
const LOCAL_SCREENSHOT_MISMATCH_THRESHOLD = 0.05;
const BROWSER_SCREENSHOT_MISMATCH_THRESHOLD =
  process.platform === CANONICAL_SCREENSHOT_PLATFORM
    ? CANONICAL_SCREENSHOT_MISMATCH_THRESHOLD
    : LOCAL_SCREENSHOT_MISMATCH_THRESHOLD;
const BROWSER_VIEWPORT = { height: 1000, width: 1280 } as const;
const REDUCED_MOTION_CONTEXT = { reducedMotion: "reduce" } as const;

const browserPolicy = getBrowserPolicy({
  argv: process.argv,
  isCi: process.env["CI"] === "true",
  platform: process.platform,
});

if (browserPolicy.shouldBlockSnapshotWrites) {
  throw new Error(
    `Visual screenshot baselines are Linux-only. Current platform: ${process.platform}. ` +
      "Run browser visual tests in Linux CI or a Linux container before updating baselines."
  );
}

function createBrowserInstance(theme: BrowserTheme) {
  return {
    browser: "chromium",
    context: {
      ...REDUCED_MOTION_CONTEXT,
      colorScheme: theme,
    },
    env: { PUBLIC_TEST_BROWSER_THEME: theme },
    name: `chromium-${theme}`,
    screenshotDirectory: `__screenshots__/${theme}`,
  } as const;
}

function getBrowserProjectName(themes: readonly BrowserTheme[]) {
  if (themes.length > 1) {
    return VITEST_PROJECT_NAMES.browser;
  }

  return themes[0] === "dark"
    ? VITEST_PROJECT_NAMES.browserDark
    : VITEST_PROJECT_NAMES.browserLight;
}

function createBrowserConfig(themes: readonly BrowserTheme[]) {
  if (themes.length === 0) {
    throw new Error("Expected at least one browser theme.");
  }

  return defineConfig({
    ...createVitestBaseConfig(),
    optimizeDeps: {
      include: [...VITEST_BROWSER_OPTIMIZE_DEPS],
    },
    test: {
      browser: {
        api: {
          allowExec: browserPolicy.canRunBrowserTestsFromUi,
          allowWrite: browserPolicy.canWriteBrowserArtifacts,
          host: "127.0.0.1",
        },
        enabled: true,
        expect: {
          toMatchScreenshot: {
            comparatorOptions: {
              allowedMismatchedPixelRatio:
                BROWSER_SCREENSHOT_MISMATCH_THRESHOLD,
            },
            resolveScreenshotPath: ({
              arg,
              browserName,
              ext,
              root,
              screenshotDirectory,
              testFileDirectory,
              testFileName,
            }) =>
              `${root}/${testFileDirectory}/${screenshotDirectory}/${testFileName}/${arg}-${browserName}-${CANONICAL_SCREENSHOT_PLATFORM}${ext}`,
          },
        },
        headless: true,
        instances: themes.map(createBrowserInstance),
        locators: {
          exact: true,
        },
        provider: playwright(),
        screenshotFailures: true,
        viewport: BROWSER_VIEWPORT,
      },
      clearMocks: true,
      exclude: ["node_modules/**"],
      include: ["src/**/*.browser.{test,spec}.{ts,tsx}"],
      name: getBrowserProjectName(themes),
      passWithNoTests: false,
      setupFiles: VITEST_SETUP_FILES.browser,
      slowTestThreshold: VITEST_SLOW_TEST_THRESHOLDS.browser,
      testTimeout: VITEST_TIMEOUTS.browser,
    },
  });
}

export type { BrowserTheme };
export {
  BROWSER_SCREENSHOT_MISMATCH_THRESHOLD,
  BROWSER_VIEWPORT,
  createBrowserConfig,
  createBrowserInstance,
};
