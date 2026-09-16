import type { Request } from "playwright/test";
import { expect, test } from "./base";
import { mockDataExplorerApp } from "./data-explorer-fixtures";
import { mockRpc } from "./helpers";

for (const scenario of [
  { effectiveType: "4g", interaction: "hover", preload: true, saveData: false },
  { effectiveType: "4g", interaction: "focus", preload: true, saveData: false },
  { effectiveType: "4g", interaction: "hover", preload: false, saveData: true },
  {
    effectiveType: "3g",
    interaction: "hover",
    preload: false,
    saveData: false,
  },
] as const) {
  test(`code-only ${scenario.interaction}: code preload=${scenario.preload}, saveData=${scenario.saveData}, ${scenario.effectiveType}`, async ({
    page,
  }) => {
    await mockDataExplorerApp(page);
    await mockRpc(page, "ExtensionService/ListExtensions", { extensions: [] });
    await page.addInitScript(
      (connection) => {
        Object.defineProperty(navigator, "connection", {
          configurable: true,
          value: connection,
        });
      },
      { effectiveType: scenario.effectiveType, saveData: false }
    );
    await page.clock.install();

    const rpcRequests: string[] = [];
    const scripts: string[] = [];
    const pending = new Set<Request>();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        errors.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on("request", (request) => {
      if (request.method() === "POST") {
        rpcRequests.push(request.url());
        pending.add(request);
      }
      if (request.resourceType() === "script") {
        scripts.push(request.url());
      }
    });
    page.on("requestfinished", (request) => pending.delete(request));
    page.on("requestfailed", (request) => pending.delete(request));

    await page.goto("/instances/production/databases/appdb/extensions");
    await expect(
      page.getByRole("heading", { name: "Extensions", exact: true })
    ).toBeVisible();
    // Expire metadata freshness: a cached active parent must not hide data preloads.
    await page.clock.fastForward(310_000);
    await expect.poll(() => pending.size).toBe(0);
    if (scenario.saveData) {
      await page.evaluate(() => {
        Object.defineProperty(navigator, "connection", {
          value: { effectiveType: "4g", saveData: true },
        });
      });
    }
    expect(
      rpcRequests.some((url) => url.endsWith("SchemaService/ListSchemas"))
    ).toBe(false);
    const initialRpcRequests = [...rpcRequests];
    const initialScripts = [...scripts];
    const explorer = page.getByRole("link", {
      name: "Data Explorer",
      exact: true,
    });

    if (scenario.interaction === "hover") {
      await explorer.hover();
    } else {
      await explorer.focus();
    }
    // Flush delayed work so speculative queries cannot hide behind timers.
    await page.clock.runFor(1000);
    if (scenario.preload) {
      await expect
        .poll(() => scripts.length)
        .toBeGreaterThan(initialScripts.length);
    } else {
      expect(scripts).toEqual(initialScripts);
    }
    expect(rpcRequests).toEqual(initialRpcRequests);

    await explorer.click();
    await expect(
      page.getByRole("heading", { name: "public", exact: true })
    ).toBeVisible();
    await expect
      .poll(
        () =>
          rpcRequests.filter((url) => url.endsWith("SchemaService/ListSchemas"))
            .length
      )
      .toBe(1);
    expect(errors).toEqual([]);
  });
}
