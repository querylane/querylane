import { describe, expect, test } from "@rstest/core";
import playwrightConfig from "../e2e/playwright.config";
import rstestBrowserConfig from "../rstest.browser.config";
import rstestBrowserDarkConfig from "../rstest.browser.dark.config";

const VISUAL_PROJECT_NAMES = ["visual-light", "visual-dark"];

describe("test harness config", () => {
  test("keeps rstest browser checks fast, deterministic, and Chromium only", () => {
    for (const config of [rstestBrowserConfig, rstestBrowserDarkConfig]) {
      expect(config.testTimeout).toBeLessThanOrEqual(10_000);
      expect(config.browser).toMatchObject({
        browser: "chromium",
        headless: true,
        provider: "playwright",
        viewport: { height: 1000, width: 1280 },
      });
    }
    expect(rstestBrowserConfig.env).toEqual({
      PUBLIC_TEST_BROWSER_THEME: "light",
    });
    expect(rstestBrowserDarkConfig.env).toEqual({
      PUBLIC_TEST_BROWSER_THEME: "dark",
    });
  });

  test("keeps Playwright visual baselines explicit and tightly compared", () => {
    expect(playwrightConfig.updateSnapshots).toBe("none");

    const visualProjects = (playwrightConfig.projects ?? []).filter(
      (project) => VISUAL_PROJECT_NAMES.includes(project.name ?? "")
    );
    expect(visualProjects.map((project) => project.name)).toEqual(
      VISUAL_PROJECT_NAMES
    );
    for (const project of visualProjects) {
      const screenshot = project.expect?.toHaveScreenshot;
      expect(screenshot?.maxDiffPixelRatio).toBeLessThanOrEqual(0.05);
      expect(screenshot).toMatchObject({
        animations: "disabled",
        caret: "hide",
        scale: "css",
      });
      expect(project.use?.viewport).toEqual({ height: 1000, width: 1280 });
    }
  });
});
