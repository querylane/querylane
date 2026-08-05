import {
  defineConfig,
  devices,
  type PlaywrightTestConfig,
} from "playwright/test";
import baseConfig from "./playwright.config";

export default defineConfig(baseConfig, {
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
    {
      name: "firefox",
      use: devices["Desktop Firefox"],
    },
    {
      name: "webkit",
      use: devices["Desktop Safari"],
    },
  ] satisfies PlaywrightTestConfig["projects"],
  testMatch: "**/base-ui-contracts.spec.ts",
});
