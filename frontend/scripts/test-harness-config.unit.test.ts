import { describe, expect, test } from "@rstest/core";
import rstestBrowserConfig from "../rstest.browser.config";
import browserDarkConfig from "../vitest.browser.dark.config";
import browserLightConfig from "../vitest.browser.light.config";
import { resolveBrowserScreenshotDirectory } from "../vitest.browser.shared";

function getAllowWrite(api: unknown) {
  if (
    typeof api === "object" &&
    api !== null &&
    "allowWrite" in api &&
    typeof api.allowWrite === "boolean"
  ) {
    return api.allowWrite;
  }

  throw new Error("Expected Vitest API config to expose allowWrite.");
}

describe("test harness config", () => {
  test("keeps browser checks fast, deterministic, and Chromium only", () => {
    expect(browserLightConfig.test?.testTimeout).toBeLessThanOrEqual(10_000);
    expect(browserDarkConfig.test?.testTimeout).toBeLessThanOrEqual(10_000);
    expect(browserLightConfig.test?.browser?.viewport).toEqual({
      height: 1000,
      width: 1280,
    });
    expect(rstestBrowserConfig.browser?.viewport).toEqual({
      height: 1000,
      width: 1280,
    });
    expect(getAllowWrite(browserLightConfig.test?.api)).toBe(true);
    expect(browserLightConfig.test?.api).toMatchObject({
      host: "127.0.0.1",
    });
    expect(browserLightConfig.test?.browser).not.toHaveProperty("api");
    const comparatorOptions =
      browserLightConfig.test?.browser?.expect?.toMatchScreenshot
        ?.comparatorOptions;
    if (!comparatorOptions) {
      throw new Error("Expected browser screenshot comparator options.");
    }
    expect(comparatorOptions.allowedMismatchedPixelRatio).toBeLessThanOrEqual(
      0.05
    );
    expect(
      browserLightConfig.test?.browser?.expect?.toMatchScreenshot
        ?.screenshotOptions?.scale
    ).toBe("css");
    expect(
      resolveBrowserScreenshotDirectory({
        project: {
          config: { browser: { screenshotDirectory: "__screenshots__/dark" } },
        },
        root: "/repo/frontend",
        screenshotDirectory: "__screenshots__",
        testFileDirectory: "src/components",
      })
    ).toBe("/repo/frontend/src/components/__screenshots__/dark");
  });
});
