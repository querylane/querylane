import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  outputDir: "../../test-results/memory-controls",
  reporter: [
    ["list"],
    ["json", { outputFile: "../../test-results/memory-controls/report.json" }],
  ],
  retries: 0,
  workers: 1,
  timeout: 45_000,
  use: {
    browserName: "chromium",
    headless: true,
    trace: "off",
    video: "off",
    screenshot: "off",
  },
});
