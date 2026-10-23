/**
 * QueryLane Playwright fixture.
 *
 * Import `test` and `expect` from this module. It installs a catch-all API
 * guard before test-specific mocks. Playwright resolves routes in LIFO order,
 * so specific `mockRpc()` calls registered by tests still win; anything that
 * falls through is treated as an unmocked backend dependency and fails the test.
 */

import { AxeBuilder } from "@axe-core/playwright";
import {
  test as base,
  type Page,
  expect as playwrightExpect,
} from "playwright/test";
import { shouldGuardApiRequest } from "../../src/test/api-request-policy";
import { e2eEnv } from "../env";

interface Fixtures {
  checkAccessibility: () => Promise<void>;
  unmockedGuard: undefined;
}

const expect = playwrightExpect;

const test = base.extend<Fixtures>({
  checkAccessibility: async ({ page }, provideFixture, testInfo) => {
    await provideFixture(async () => {
      const results = await new AxeBuilder({ page })
        .withTags([
          "wcag2a",
          "wcag2aa",
          "wcag21a",
          "wcag21aa",
          "wcag22aa",
          "best-practice",
        ])
        .analyze();
      await testInfo.attach("accessibility-scan", {
        body: JSON.stringify(results, null, 2),
        contentType: "application/json",
      });
      expect(results.violations).toEqual([]);
    });
  },
  unmockedGuard: [
    async ({ page }, provideFixture) => {
      const unmockedCalls: string[] = [];

      await page.route("**/*", async (route) => {
        const request = route.request();
        const shouldGuard = shouldGuardApiRequest({
          apiBaseUrl: e2eEnv.QUERYLANE_API_URL ?? "http://localhost:8080",
          headers: request.headers(),
          method: request.method(),
          url: request.url(),
        });

        if (shouldGuard) {
          unmockedCalls.push(request.url());
          await route.fulfill({
            body: JSON.stringify({
              code: "unmocked",
              message: `Unmocked QueryLane RPC: ${request.url()}`,
            }),
            contentType: "application/json",
            status: 503,
          });
          return;
        }

        await route.continue();
      });

      await provideFixture(undefined);

      if (unmockedCalls.length > 0) {
        throw new Error(
          `Unmocked QueryLane RPCs detected — add mocks for each:\n${unmockedCalls
            .map((url) => `  • ${url}`)
            .join("\n")}`
        );
      }
    },
    { auto: true },
  ],
});

async function softScreenshot(page: Page, name: string) {
  const panel = page.locator("[data-onboarding-panel]").first();
  const screenshotTarget =
    (await panel.count()) > 0 ? panel : page.locator("main, body").first();
  const buffer = await screenshotTarget.screenshot({ animations: "disabled" });
  await test.info().attach(name, { body: buffer, contentType: "image/png" });
}

export { expect, softScreenshot, test };
