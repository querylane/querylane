import { describe, expect, test } from "vitest";
import packageJson from "../package.json" with { type: "json" };
import browserAllConfig from "../vitest.browser.all.config";
import browserConfig from "../vitest.browser.config";
import browserDarkConfig from "../vitest.browser.dark.config";
import browserLightConfig from "../vitest.browser.light.config";
import { resolveBrowserScreenshotDirectory } from "../vitest.browser.shared";
import integrationConfig from "../vitest.integration.config";
import {
  VITEST_PROJECT_CONFIGS,
  VITEST_PROJECT_NAME_ORDER,
} from "../vitest.projects";
import {
  VITEST_BROWSER_OPTIMIZE_DEPS,
  VITEST_PLUGIN_NAMES,
} from "../vitest.shared";
import unitConfig from "../vitest.unit.config";

const TEST_NUMBER_10000 = 10_000;
const TEST_NUMBER_0_POINT_05 = 0.05;

const { scripts } = packageJson;
const VITEST_BETA_VERSION_PATTERN = /^5\.0\.0-beta\.\d+$/u;
const PLAYWRIGHT_PRERELEASE_VERSION_PATTERN =
  /^1\.62\.0-(alpha|beta|rc)[\w.-]*$/u;

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
  test("splits unit, integration, browser light, and browser dark projects", () => {
    expect([...VITEST_PROJECT_CONFIGS]).toEqual([
      "./vitest.unit.config.ts",
      "./vitest.integration.config.ts",
      "./vitest.browser.light.config.ts",
      "./vitest.browser.dark.config.ts",
    ]);
    expect([...VITEST_PROJECT_NAME_ORDER]).toEqual([
      "unit",
      "integration",
      "browser-light",
      "browser-dark",
    ]);
  });

  test("uses happy-dom and shared setup for unit and integration tests", () => {
    expect(unitConfig.test?.environment).toBe("happy-dom");
    expect(integrationConfig.test?.environment).toBe("happy-dom");
    expect(unitConfig.test?.setupFiles).toEqual("./vitest.setup.ts");
    expect(integrationConfig.test?.setupFiles).toEqual("./vitest.setup.ts");
    expect(unitConfig.test?.execArgv).toContain("--no-experimental-webstorage");
    expect(integrationConfig.test?.execArgv).toContain(
      "--no-experimental-webstorage"
    );
  });

  test("defaults browser script and config to light mode only", () => {
    expect(scripts["test:browser"]).toContain("vitest.browser.config.ts");
    expect(browserConfig.test?.browser?.instances).toHaveLength(1);
    expect(browserConfig.test?.browser?.instances?.[0]).toMatchObject({
      browser: "chromium",
      name: "chromium-light",
    });
    expect(browserLightConfig.test?.browser?.instances?.[0]).toMatchObject({
      name: "chromium-light",
    });
  });

  test("offers an explicit dark browser config without adding package scripts", () => {
    expect(browserDarkConfig.test?.browser?.instances?.[0]).toMatchObject({
      browser: "chromium",
      name: "chromium-dark",
    });
    expect(browserAllConfig.test?.browser?.instances).toHaveLength(2);
  });

  test("keeps browser checks fast, deterministic, and Chromium only", () => {
    expect(browserLightConfig.test?.testTimeout).toBeLessThanOrEqual(
      TEST_NUMBER_10000
    );
    expect(browserDarkConfig.test?.testTimeout).toBeLessThanOrEqual(
      TEST_NUMBER_10000
    );
    expect(browserLightConfig.test?.browser?.viewport).toEqual({
      height: 1000,
      width: 1280,
    });
    expect(getAllowWrite(browserLightConfig.test?.api)).toBe(
      getAllowWrite(browserLightConfig.test?.browser?.api)
    );
    const comparatorOptions =
      browserLightConfig.test?.browser?.expect?.toMatchScreenshot
        ?.comparatorOptions;
    if (!comparatorOptions) {
      throw new Error("Expected browser screenshot comparator options.");
    }
    expect(comparatorOptions.allowedMismatchedPixelRatio).toBeLessThanOrEqual(
      TEST_NUMBER_0_POINT_05
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

  test("uses one requested prerelease Vitest browser dependency set", () => {
    const { devDependencies } = packageJson;
    const vitestVersion = devDependencies.vitest;

    expect(vitestVersion).toMatch(VITEST_BETA_VERSION_PATTERN);
    expect(devDependencies["@vitest/browser"]).toBe(vitestVersion);
    expect(devDependencies["@vitest/browser-playwright"]).toBe(vitestVersion);
    expect(devDependencies["@vitest/coverage-v8"]).toBe(vitestVersion);
    expect(devDependencies["@vitest/ui"]).toBe(vitestVersion);
    expect(devDependencies.playwright).toBe(devDependencies["playwright-core"]);
    expect(devDependencies.playwright).toMatch(
      PLAYWRIGHT_PRERELEASE_VERSION_PATTERN
    );
  });

  test("prebundles direct browser-test dependencies", () => {
    expect([...VITEST_BROWSER_OPTIMIZE_DEPS]).toEqual(
      expect.arrayContaining([
        "lucide-react",
        "react",
        "react-dom",
        "vitest-browser-react",
      ])
    );
  });

  test("keeps jsdom and direct Babel plugins out of Vitest", () => {
    expect(packageJson.devDependencies).not.toHaveProperty("jsdom");
    expect(packageJson.dependencies).not.toHaveProperty("jsdom");
    expect(packageJson.devDependencies).not.toHaveProperty("@babel/core");
    expect(packageJson.devDependencies).not.toHaveProperty(
      "@rolldown/plugin-babel"
    );
    expect(packageJson.devDependencies).not.toHaveProperty(
      "@vitejs/plugin-react"
    );
    expect([...VITEST_PLUGIN_NAMES]).toEqual(["tailwindcss"]);
    expect(unitConfig.plugins).toHaveLength(1);
  });

  test("does not expose scripts whose backing files are gone", () => {
    expect(scripts).not.toHaveProperty("test:watch");
    expect(scripts).not.toHaveProperty("coverage:merge");
    expect(scripts).not.toHaveProperty("test:e2e:coverage");

    for (const script of Object.values(scripts)) {
      expect(script).not.toContain("scripts/test-watch.ts");
      expect(script).not.toContain("scripts/merge-lcov.ts");
      expect(script).not.toContain("scripts/generate-e2e-coverage.ts");
    }
  });

  test("does not ship disabled table devtools", () => {
    expect(packageJson.dependencies).not.toHaveProperty(
      "@tanstack/table-devtools"
    );
    expect(packageJson.dependencies).not.toHaveProperty(
      "@tanstack/react-table-devtools"
    );
    expect(packageJson.dependencies).not.toHaveProperty(
      "@tanstack/react-devtools"
    );
  });

  test("keeps unused registry components out of the app", async () => {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const unusedUiFiles = [
      "aspect-ratio.tsx",
      "breadcrumb.tsx",
      "button-group.tsx",
      "context-menu.tsx",
      "direction.tsx",
      "drawer.tsx",
      "hover-card.tsx",
      "input-otp.tsx",
      "menubar.tsx",
      "native-select.tsx",
      "navigation-menu.tsx",
      "overview-value.tsx",
      "pagination.tsx",
      "radio-group.tsx",
      "scroll-area.tsx",
      "slider.tsx",
      "toggle-group.tsx",
      "toggle.tsx",
    ];

    for (const file of unusedUiFiles) {
      expect(
        existsSync(join(import.meta.dirname, "../src/components/ui", file))
      ).toBe(false);
    }
  });

  test("does not expose diagnostic wrapper commands", () => {
    expect(scripts["test:integration:leaks"]).toBe(
      "vitest run --config vitest.integration.config.ts --detectAsyncLeaks"
    );
    expect(scripts).not.toHaveProperty("test:unit:leaks");
    expect(scripts).not.toHaveProperty("test:browser:dark");
    expect(scripts).not.toHaveProperty("test:browser:all");
    expect(scripts).not.toHaveProperty("test:browser:dark:update");
    expect(scripts).not.toHaveProperty("test:browser:all:update");
    expect(scripts).not.toHaveProperty("test:browser:dark:ui");
    expect(scripts).not.toHaveProperty("test:browser:warnings");
    expect(scripts).not.toHaveProperty("test:heap");
    expect(scripts).not.toHaveProperty("test:open-handles");
    expect(scripts).not.toHaveProperty("test:warnings");

    for (const script of Object.values(scripts)) {
      expect(script).not.toContain("scripts/check-async-leaks.ts");
      expect(script).not.toContain("scripts/check-test-warnings.ts");
    }
  });
});
