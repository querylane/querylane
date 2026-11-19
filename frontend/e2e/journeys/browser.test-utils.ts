import { AxeBuilder } from "@axe-core/playwright";
import { HttpResponse, http } from "msw";
import { test as base, expect as playwrightExpect } from "playwright/test";
import { e2eEnv } from "../env";
import { shouldGuardApiRequest } from "./api-request-policy.test-utils";
import { fulfillFromMsw, mockNetwork } from "./msw-network.test-utils";

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
          await fulfillFromMsw(
            route,
            http.post("*", () =>
              HttpResponse.json(
                {
                  code: "unavailable",
                  message: `Unhandled Querylane RPC: ${request.url()}`,
                },
                { status: 503 }
              )
            )
          );
          return;
        }

        await route.continue();
      });

      await mockNetwork(
        page,
        "https://api.github.com/**",
        http.get("*", () => HttpResponse.json({ stargazers_count: 1200 }))
      );
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

export { expect, test };
