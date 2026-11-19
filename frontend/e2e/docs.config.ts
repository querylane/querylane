import path from "node:path";
import { defineConfig, devices } from "playwright/test";
import { e2eEnv } from "./env";

const BASE_URL_KEY = "baseURL";
const baseUrl = e2eEnv.DOCS_BASE_URL ?? "http://127.0.0.1:4184";

export default defineConfig({
  testDir: "./docs",
  testMatch: "**/*.e2e.test.ts",
  outputDir: "../test-results/docs",
  reporter: "list",
  retries: 0,
  workers: 1,
  timeout: 30_000,
  use: {
    [BASE_URL_KEY]: baseUrl,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "docs-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "docs-mobile",
      testIgnore: "**/actions.e2e.test.ts",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  ...(e2eEnv.DOCS_BASE_URL === undefined && {
    webServer: {
      command: "HOST=127.0.0.1 PORT=4184 node dist/server/entry.mjs",
      cwd: path.resolve(import.meta.dirname, "../.."),
      url: baseUrl,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  }),
});
