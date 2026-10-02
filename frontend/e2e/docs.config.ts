import path from "node:path";
import { defineConfig, devices } from "playwright/test";
import { e2eEnv } from "./env";

const BASE_URL_KEY = "baseURL";
const baseUrl = e2eEnv.DOCS_BASE_URL ?? "http://127.0.0.1:4184";

export default defineConfig({
  testDir: "./docs",
  outputDir: "./test-results/docs",
  reporter: "list",
  retries: 0,
  workers: 1,
  timeout: 30_000,
  updateSnapshots: "none",
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{platform}/{projectName}/{arg}{ext}",
  expect: {
    toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.02 },
  },
  use: {
    [BASE_URL_KEY]: baseUrl,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: [
    ...(["light", "dark"] as const).map((colorScheme) => ({
      name: `docs-${colorScheme}`,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        colorScheme,
      },
    })),
    {
      name: "docs-mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  ...(!e2eEnv.DOCS_BASE_URL && {
    webServer: {
      command: "HOST=127.0.0.1 PORT=4184 node dist/server/entry.mjs",
      cwd: path.resolve(import.meta.dirname, "../.."),
      url: baseUrl,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  }),
});
