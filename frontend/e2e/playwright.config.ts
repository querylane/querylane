import {
  defineConfig,
  devices,
  type PlaywrightTestConfig,
} from "playwright/test";
import { e2eEnv } from "./env";

const DEFAULT_PORT = 4173;
const EXPECT_TIMEOUT_MS = 5000;
const ACTION_TIMEOUT_MS = 5000;
const NAVIGATION_TIMEOUT_MS = 10_000;
const LOCAL_TEST_TIMEOUT_MS = 10_000;
const CI_TEST_TIMEOUT_MS = 45_000;
const WEB_SERVER_TIMEOUT_MS = 120_000;
const SCREENSHOT_MISMATCH_THRESHOLD = 0.02;
const LOCAL_WORKERS = 2;
const CI_RETRIES = 1;
const PORT = e2eEnv.PORT ?? e2eEnv.PLAYWRIGHT_PORT ?? DEFAULT_PORT;
const BASE_URL =
  e2eEnv.BASE_URL ?? e2eEnv.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const PLAYWRIGHT_BASE_URL_KEY = "baseURL";
const useExternalServer = Boolean(
  e2eEnv.BASE_URL ?? e2eEnv.PLAYWRIGHT_BASE_URL
);
const serverCommand = e2eEnv.QUERYLANE_E2E_SKIP_BUILD
  ? `bun run preview --host 127.0.0.1 --port ${PORT}`
  : `bun run build && bun run preview --host 127.0.0.1 --port ${PORT}`;

const CHROMIUM_LAUNCH_OPTIONS = {
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
};

export default defineConfig({
  captureGitInfo: { commit: true, diff: false },
  expect: {
    timeout: EXPECT_TIMEOUT_MS,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: SCREENSHOT_MISMATCH_THRESHOLD,
    },
  },
  failOnFlakyTests: e2eEnv.CI,
  forbidOnly: e2eEnv.CI,
  fullyParallel: true,
  outputDir: "./test-results",
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: CHROMIUM_LAUNCH_OPTIONS,
      },
    },
  ] satisfies PlaywrightTestConfig["projects"],
  // Keep CI logs readable: list prints test names instead of dot progress,
  // GitHub annotations surface failures, and HTML/JSON keep full artifacts off-log.
  reporter: e2eEnv.CI
    ? [
        ["list"],
        ["github"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
        ["json", { outputFile: "test-results/results.json" }],
      ]
    : [["./llm-reporter.ts"]],
  retries: e2eEnv.CI ? CI_RETRIES : 0,
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{testFileBaseName}/{projectName}/{arg}{ext}",
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: e2eEnv.CI ? CI_TEST_TIMEOUT_MS : LOCAL_TEST_TIMEOUT_MS,
  use: {
    actionTimeout: ACTION_TIMEOUT_MS,
    [PLAYWRIGHT_BASE_URL_KEY]: BASE_URL,
    colorScheme: "light",
    contextOptions: { reducedMotion: "reduce" },
    headless: true,
    locale: "en-US",
    navigationTimeout: NAVIGATION_TIMEOUT_MS,
    // Viewport captures avoid oversized full-page artifacts with large blank
    // bands around centered onboarding screens. Tests that need visual review
    // should use softScreenshot(), which captures the content panel instead.
    screenshot: { fullPage: false, mode: "only-on-failure" },
    timezoneId: "UTC",
    trace: e2eEnv.CI ? "retain-on-failure-and-retries" : "retain-on-failure",
    video: e2eEnv.CI
      ? {
          mode: "on-first-retry",
          show: {
            actions: { position: "top-right" },
            test: { level: "title", position: "top-left" },
          },
        }
      : "off",
    viewport: { height: 900, width: 1280 },
  },
  ...(!useExternalServer && {
    webServer: {
      command: serverCommand,
      reuseExistingServer: !e2eEnv.CI,
      stderr: e2eEnv.CI ? "ignore" : "pipe",
      stdout: e2eEnv.CI ? "ignore" : "pipe",
      timeout: WEB_SERVER_TIMEOUT_MS,
      url: BASE_URL,
    },
  }),
  ...(e2eEnv.CI ? {} : { workers: LOCAL_WORKERS }),
});
