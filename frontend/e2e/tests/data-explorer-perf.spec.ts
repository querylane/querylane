import { gzipSync } from "node:zlib";
import type { Page, Response } from "playwright/test";
import { FRONTEND_PERF_BUDGETS } from "../../scripts/perf-budgets";
import { expect, test } from "./base";
import { mockDataExplorerApp } from "./data-explorer-fixtures";

const DATA_EXPLORER_TABLE_URL =
  "/instances/production/databases/appdb/explorer?schema=public&category=tables&name=orders";
const DATABASE_OVERVIEW_URL = "/instances/production/databases/appdb";
const DATA_EXPLORER_URL_RE =
  /\/instances\/production\/databases\/appdb\/explorer/;
const ORDERS_HEADING_RE = /public\.orders/;

function isScriptOrStyleResponse(response: Response): boolean {
  if (!response.ok()) {
    return false;
  }

  const { pathname } = new URL(response.url());
  return pathname.endsWith(".js") || pathname.endsWith(".css");
}

function createAssetPayloadRecorder(page: Page) {
  const bodyReads: Promise<number>[] = [];
  let recording = false;

  const handleResponse = (response: Response) => {
    if (!(recording && isScriptOrStyleResponse(response))) {
      return;
    }

    bodyReads.push(
      response
        .body()
        .then((body) => gzipSync(body).byteLength)
        .catch(() => 0)
    );
  };

  page.on("response", handleResponse);

  return {
    start() {
      recording = true;
    },
    async stop() {
      recording = false;
      page.off("response", handleResponse);
      const sizes = await Promise.all(bodyReads);
      return sizes.reduce((sum, size) => sum + size, 0);
    },
  };
}

test("perf: direct Data Explorer route becomes ready within budget", {
  tag: ["@perf", "@feat:data-explorer"],
}, async ({ page }) => {
  await mockDataExplorerApp(page);

  const startedAt = Date.now();
  await page.goto(DATA_EXPLORER_TABLE_URL);
  await expect(
    page.getByRole("heading", { name: ORDERS_HEADING_RE })
  ).toBeVisible();
  await expect(page.getByText("ada@example.com")).toBeVisible();
  const readyMs = Date.now() - startedAt;

  expect(readyMs).toBeLessThanOrEqual(
    FRONTEND_PERF_BUDGETS["data-explorer-direct-ready-ms"]
  );
});

test("perf: database overview opens Data Explorer within payload and latency budgets", {
  tag: ["@perf", "@feat:data-explorer"],
}, async ({ page }) => {
  await mockDataExplorerApp(page);
  await page.goto(DATABASE_OVERVIEW_URL);
  await expect(page.getByRole("heading", { name: "appdb" })).toBeVisible();
  await page.waitForLoadState("networkidle");

  const recorder = createAssetPayloadRecorder(page);
  recorder.start();
  const startedAt = Date.now();
  await page.getByRole("link", { name: "Open data explorer" }).click();
  await expect(page).toHaveURL(DATA_EXPLORER_URL_RE);
  await expect(page.getByRole("heading", { name: "public" })).toBeVisible();
  const readyMs = Date.now() - startedAt;
  await page.waitForLoadState("networkidle");
  const payloadGzipBytes = await recorder.stop();

  expect(readyMs).toBeLessThanOrEqual(
    FRONTEND_PERF_BUDGETS["data-explorer-overview-click-ms"]
  );
  expect(payloadGzipBytes).toBeLessThanOrEqual(
    FRONTEND_PERF_BUDGETS["data-explorer-cold-payload-gzip-bytes"]
  );
});
