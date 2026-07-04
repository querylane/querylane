/**
 * QueryLane Playwright fixture.
 *
 * Import `test` and `expect` from this module. It installs a catch-all API
 * guard before test-specific mocks. Playwright resolves routes in LIFO order,
 * so specific `mockRpc()` calls registered by tests still win; anything that
 * falls through is treated as an unmocked backend dependency and fails the test.
 */

import AxeBuilder from "@axe-core/playwright";
import {
  test as base,
  type Page,
  expect as playwrightExpect,
} from "playwright/test";
import { e2eEnv } from "../env";

interface Fixtures {
  makeAxeBuilder: () => AxeBuilder;
  unmockedGuard: undefined;
}

const expect = playwrightExpect;

function isApiRequest(url: string) {
  const parsedUrl = new URL(url);
  const apiBaseUrl = new URL(
    e2eEnv.QUERYLANE_API_URL ?? "http://localhost:8080"
  );

  return (
    parsedUrl.origin === apiBaseUrl.origin ||
    (parsedUrl.hostname === "localhost" && parsedUrl.port === "8080")
  );
}

const test = base.extend<Fixtures>({
  makeAxeBuilder: async ({ page }, use) => {
    await use(() =>
      new AxeBuilder({ page }).withTags([
        "wcag2a",
        "wcag2aa",
        "wcag21a",
        "wcag21aa",
      ])
    );
  },
  unmockedGuard: [
    async ({ page }, use) => {
      const unmockedCalls: string[] = [];

      await page.route("**/*", async (route) => {
        const request = route.request();
        const contentType = request.headers()["content-type"] ?? "";
        const shouldGuard =
          request.method() === "POST" &&
          contentType.includes("json") &&
          isApiRequest(request.url());

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

      await use(undefined);

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
