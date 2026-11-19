import { gzipSync } from "node:zlib";
import type { Page, Request, Response } from "playwright/test";
import { FRONTEND_PERF_BUDGETS } from "../../scripts/perf-budgets";
import { expect, test } from "./browser.test-utils";
import { mockDataExplorerApp } from "./data-explorer.fixture";
import { mockOverviewSupportData } from "./querylane-rpc.fixture";

const DATABASE_OVERVIEW_URL = "/instances/production/databases/appdb";
const DATA_EXPLORER_URL_RE =
  /\/instances\/production\/databases\/appdb\/explorer/u;

function isScriptOrStyleResponse(response: Response) {
  if (!response.ok()) {
    return false;
  }

  const { pathname } = new URL(response.url());
  return pathname.endsWith(".js") || pathname.endsWith(".css");
}

function createAssetPayloadRecorder(page: Page) {
  const pending = new Map<Request, PromiseWithResolvers<void>>();
  const bodyReads: Promise<number>[] = [];
  const failures: string[] = [];
  let recording = false;

  const isAsset = (request: Request) =>
    request.resourceType() === "script" ||
    request.resourceType() === "stylesheet";
  const handleRequest = (request: Request) => {
    if (isAsset(request)) {
      pending.set(request, Promise.withResolvers());
    }
  };
  const handleFinished = (request: Request) => {
    pending.get(request)?.resolve();
    pending.delete(request);
  };
  const handleFailed = (request: Request) => {
    if (pending.has(request)) {
      failures.push(`Asset request failed: ${request.url()}`);
      handleFinished(request);
    }
  };
  const handleResponse = (response: Response) => {
    if (!(recording && isScriptOrStyleResponse(response))) {
      return;
    }

    bodyReads.push(
      response
        .body()
        .then((body) => gzipSync(body).byteLength)
        .catch((error: unknown) => {
          failures.push(
            `${response.url()}: ${error instanceof Error ? error.message : "Body unavailable"}`
          );
          return 0;
        })
    );
  };
  page.on("request", handleRequest);
  page.on("requestfinished", handleFinished);
  page.on("requestfailed", handleFailed);
  page.on("response", handleResponse);

  async function drain() {
    await Promise.all(pending.values().map(({ promise }) => promise));
    const sizes = await Promise.all(bodyReads);
    if (failures.length > 0) {
      throw new AggregateError(failures, "Asset payload measurement failed");
    }
    return sizes.reduce((sum, size) => sum + size, 0);
  }
  return {
    drain,
    start() {
      recording = true;
    },
    async stop() {
      try {
        return await drain();
      } finally {
        recording = false;
        page.off("request", handleRequest);
        page.off("requestfinished", handleFinished);
        page.off("requestfailed", handleFailed);
        page.off("response", handleResponse);
      }
    },
  };
}

test.beforeEach(async ({ page }) => {
  await mockOverviewSupportData(page);
});

test("perf: database overview opens Data Explorer within payload and latency budgets", {
  tag: ["@perf", "@feat:data-explorer"],
}, async ({ page }) => {
  await mockDataExplorerApp(page);
  const recorder = createAssetPayloadRecorder(page);
  await page.goto(DATABASE_OVERVIEW_URL);
  await expect(page.getByRole("heading", { name: "appdb" })).toBeVisible();
  await recorder.drain();
  recorder.start();
  const startedAt = Date.now();
  await page.getByRole("link", { name: "Data explorer", exact: true }).click();
  await expect(page).toHaveURL(DATA_EXPLORER_URL_RE);
  await expect(page.getByRole("heading", { name: "public" })).toBeVisible();
  const readyMs = Date.now() - startedAt;
  const payloadGzipBytes = await recorder.stop();

  expect(readyMs).toBeLessThanOrEqual(
    FRONTEND_PERF_BUDGETS["data-explorer-overview-click-ms"]
  );
  expect(payloadGzipBytes).toBeLessThanOrEqual(
    FRONTEND_PERF_BUDGETS["data-explorer-cold-payload-gzip-bytes"]
  );
});
