import path from "node:path";
import { argv, platform } from "node:process";
import {
  defineConfig,
  devices,
  type PlaywrightTestConfig,
} from "playwright/test";
import { e2eEnv } from "./env";
import { CI_REPORTERS } from "./reporters";

const DEFAULT_PORT = 4173;
const EXPECT_TIMEOUT_MS = 5000;
const ACTION_TIMEOUT_MS = 5000;
const NAVIGATION_TIMEOUT_MS = 10_000;
const LOCAL_TEST_TIMEOUT_MS = 10_000;
const CI_TEST_TIMEOUT_MS = 45_000;
const WEB_SERVER_TIMEOUT_MS = 120_000;
const SCREENSHOT_MISMATCH_THRESHOLD = 0.02;
// Baselines are captured on Linux (CI and `test:visual:update` both use the
// official Playwright image). macOS and Windows font rendering drifts, so local
// runs get a looser threshold and may not rewrite baselines.
const CANONICAL_SCREENSHOT_PLATFORM = "linux";
const LOCAL_VISUAL_MISMATCH_THRESHOLD = 0.05;
const isCanonicalScreenshotPlatform =
  platform === CANONICAL_SCREENSHOT_PLATFORM;
const UPDATE_SNAPSHOTS_ARGUMENT_PATTERN = /^(-u|--update-snapshots)(=|$)/;
const LOCAL_WORKERS = 2;
// GitHub-hosted ubuntu-latest runners have 4 vCPUs; Playwright defaults to half.
const CI_WORKERS = 4;
const PORT = e2eEnv.PORT ?? e2eEnv.PLAYWRIGHT_PORT ?? DEFAULT_PORT;
const BASE_URL =
  e2eEnv.BASE_URL ?? e2eEnv.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const PLAYWRIGHT_BASE_URL_KEY = "baseURL";
const useExternalServer = Boolean(
  e2eEnv.BASE_URL ?? e2eEnv.PLAYWRIGHT_BASE_URL
);
const serverCommand = e2eEnv.QUERYLANE_E2E_SKIP_BUILD
  ? `bun run preview --host 127.0.0.1 --port ${PORT}`
  : // Adds the test-only visual harness entry. Bundle budgets are enforced on
    // the production build by the Frontend Build job, not on this one.
    `QUERYLANE_VISUAL_HARNESS=1 bunx rsbuild build && bun run preview --host 127.0.0.1 --port ${PORT}`;

if (
  !isCanonicalScreenshotPlatform &&
  argv.some((argument) => UPDATE_SNAPSHOTS_ARGUMENT_PATTERN.test(argument))
) {
  throw new Error(
    `Screenshot baselines are Linux-only. Current platform: ${platform}. ` +
      "Run `bun run test:visual:update` to update them in the Playwright container."
  );
}

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
  forbidOnly: e2eEnv.CI,
  fullyParallel: true,
  outputDir: "./test-results",
  projects: [
    {
      name: "chromium",
      testDir: "./tests",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: CHROMIUM_LAUNCH_OPTIONS,
      },
    },
    ...(["light", "dark"] as const).map((colorScheme) => ({
      expect: {
        toHaveScreenshot: {
          animations: "disabled" as const,
          caret: "hide" as const,
          maxDiffPixelRatio: isCanonicalScreenshotPlatform
            ? SCREENSHOT_MISMATCH_THRESHOLD
            : LOCAL_VISUAL_MISMATCH_THRESHOLD,
          scale: "css" as const,
        },
      },
      name: `visual-${colorScheme}`,
      testDir: "./visual",
      use: {
        ...devices["Desktop Chrome"],
        colorScheme,
        launchOptions: CHROMIUM_LAUNCH_OPTIONS,
        viewport: { height: 1000, width: 1280 },
      },
    })),
  ] satisfies PlaywrightTestConfig["projects"],
  // Keep CI logs readable: list prints test names instead of dot progress,
  // GitHub annotations surface failures, and HTML/JSON keep full artifacts off-log.
  reporter: e2eEnv.CI ? CI_REPORTERS : [["./llm-reporter.ts"]],
  retries: 0,
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{testFileBaseName}/{projectName}/{arg}{ext}",
  testMatch: "**/*.spec.ts",
  timeout: e2eEnv.CI ? CI_TEST_TIMEOUT_MS : LOCAL_TEST_TIMEOUT_MS,
  // Never write baselines implicitly: a missing snapshot fails the run.
  // `--update-snapshots` (Linux only, see guard above) is the one way to write.
  updateSnapshots: "none",
  use: {
    actionTimeout: ACTION_TIMEOUT_MS,
    [PLAYWRIGHT_BASE_URL_KEY]: BASE_URL,
    colorScheme: "light",
    reducedMotion: "reduce",
    headless: true,
    locale: "en-US",
    navigationTimeout: NAVIGATION_TIMEOUT_MS,
    // Viewport captures avoid oversized full-page artifacts with large blank
    // bands around centered onboarding screens. Tests that need visual review
    // should use softScreenshot(), which captures the content panel instead.
    screenshot: { fullPage: false, mode: "only-on-failure" },
    timezoneId: "UTC",
    trace: {
      mode: "retain-on-failure",
      snapshots: { aria: true, dom: true, screen: true },
    },
    video: "off",
    viewport: { height: 900, width: 1280 },
  },
  ...(!useExternalServer && {
    webServer: {
      command: serverCommand,
      cwd: path.resolve(import.meta.dirname, ".."),
      reuseExistingServer: !e2eEnv.CI,
      stderr: e2eEnv.CI ? "ignore" : "pipe",
      stdout: e2eEnv.CI ? "ignore" : "pipe",
      timeout: WEB_SERVER_TIMEOUT_MS,
      url: BASE_URL,
    },
  }),
  workers: e2eEnv.CI ? CI_WORKERS : LOCAL_WORKERS,
});
