import type { Page } from "playwright/test";
import { expect, test } from "./base";
import { mockDataExplorerApp } from "./data-explorer-fixtures";
import { mockRoles, mockRpc } from "./helpers";

declare global {
  interface Window {
    routeCodeWarmupTest: {
      pending: () => number;
      runNext: () => Promise<void>;
    };
  }
}

async function mockWarmupApp(page: Page) {
  await mockDataExplorerApp(page);
  await mockRoles(page);
  await mockRpc(page, "MetricsService/QueryMetrics", {});
  await mockRpc(page, "InstanceService/CheckInstanceHealth", {});
  await mockRpc(page, "ExtensionService/ListExtensions", { extensions: [] });
}

async function controlIdleCallbacks(page: Page) {
  await page.addInitScript(() => {
    const callbacks = new Map<number, IdleRequestCallback>();
    let nextId = 0;
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { effectiveType: "4g", saveData: false },
    });
    window.requestIdleCallback = (callback) => {
      nextId += 1;
      callbacks.set(nextId, callback);
      return nextId;
    };
    window.cancelIdleCallback = (id) => {
      callbacks.delete(id);
    };
    window.routeCodeWarmupTest = {
      pending: () => callbacks.size,
      runNext: async () => {
        const next = callbacks.entries().next().value;
        if (!next) {
          throw new Error("No pending idle callback");
        }
        const [id, callback] = next;
        callbacks.delete(id);
        await Promise.resolve(
          callback({ didTimeout: false, timeRemaining: () => 50 })
        );
      },
    };
  });
}

test("sidebar warms production route chunks without any new RPCs", async ({
  page,
}) => {
  await mockWarmupApp(page);
  await controlIdleCallbacks(page);
  const rpcRequests: string[] = [];
  const scripts: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "POST") {
      rpcRequests.push(request.url());
    }
    if (request.resourceType() === "script") {
      scripts.push(request.url());
    }
  });

  await page.goto("/instances/production");
  await expect(
    page.getByRole("heading", { name: "Production Postgres" })
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.routeCodeWarmupTest.pending()))
    .toBe(1);
  const initialRpcRequests = [...rpcRequests];
  const initialScriptCount = scripts.length;

  await page.evaluate(() => window.routeCodeWarmupTest.runNext());
  await expect
    .poll(() => page.evaluate(() => window.routeCodeWarmupTest.pending()))
    .toBe(1);
  await page.evaluate(() => window.routeCodeWarmupTest.runNext());
  expect(scripts.length).toBeGreaterThan(initialScriptCount);
  expect(rpcRequests).toEqual(initialRpcRequests);
  expect(errors).toEqual([]);

  await page.getByRole("link", { name: "Roles", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Roles", exact: true })
  ).toBeVisible();
  expect(rpcRequests.length).toBeGreaterThan(initialRpcRequests.length);
});

test("data saver enabled while queued prevents warming but not navigation", async ({
  page,
}) => {
  await mockWarmupApp(page);
  await controlIdleCallbacks(page);
  const scripts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") {
      scripts.push(request.url());
    }
  });
  await page.goto("/instances/production");
  await expect(
    page.getByRole("heading", { name: "Production Postgres" })
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.routeCodeWarmupTest.pending()))
    .toBe(1);
  const initialScriptCount = scripts.length;
  await page.evaluate(() => {
    Object.defineProperty(navigator, "connection", {
      value: { effectiveType: "4g", saveData: true },
    });
    return window.routeCodeWarmupTest.runNext();
  });
  expect(scripts).toHaveLength(initialScriptCount);
  expect(await page.evaluate(() => window.routeCodeWarmupTest.pending())).toBe(
    0
  );
  await page.getByRole("link", { name: "Roles", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Roles", exact: true })
  ).toBeVisible();
});

test("startup queries finish before code warmup is scheduled", async ({
  page,
}) => {
  await mockWarmupApp(page);
  await controlIdleCallbacks(page);
  const { promise, resolve } = Promise.withResolvers<void>();
  await page.route("**/*InstanceService/GetInstanceOverview", async (route) => {
    await promise;
    await route.fallback();
  });
  try {
    const overviewRequest = page.waitForRequest((request) =>
      request.url().endsWith("InstanceService/GetInstanceOverview")
    );
    await page.goto("/instances/production");
    await overviewRequest;
    await expect(
      page.getByRole("link", { name: "Roles", exact: true })
    ).toBeVisible();
    expect(
      await page.evaluate(() => window.routeCodeWarmupTest.pending())
    ).toBe(0);
    resolve();
    await expect
      .poll(() => page.evaluate(() => window.routeCodeWarmupTest.pending()))
      .toBe(1);
    await page.evaluate(() => window.routeCodeWarmupTest.runNext());
  } finally {
    resolve();
  }
});

test("database scope warms extensions code without running its data loader", async ({
  page,
}) => {
  await mockWarmupApp(page);
  await controlIdleCallbacks(page);
  const rpcRequests: string[] = [];
  const scripts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") {
      rpcRequests.push(request.url());
    }
    if (request.resourceType() === "script") {
      scripts.push(request.url());
    }
  });
  await page.goto("/instances/production/databases/appdb");
  await expect(
    page.getByRole("heading", { name: "appdb", exact: true })
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.routeCodeWarmupTest.pending()))
    .toBe(1);
  const initialRpcRequests = [...rpcRequests];
  const initialScriptCount = scripts.length;
  await page.evaluate(() => window.routeCodeWarmupTest.runNext());
  expect(scripts.length).toBeGreaterThan(initialScriptCount);
  expect(rpcRequests).toEqual(initialRpcRequests);
  await page.getByRole("link", { name: "Extensions", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Extensions", exact: true })
  ).toBeVisible();
});
