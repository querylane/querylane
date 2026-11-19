import type { Page } from "playwright/test";
import {
  MATERIALIZED_VIEW_SCHEMA,
  SCHEMA_MAP_SCHEMAS,
  SCHEMA_SUMMARY,
} from "../fixtures/data-explorer-surface.fixture";
import { expect, test } from "../journeys/browser.test-utils";
import {
  explorerUrl,
  mockExplorerSurfaces,
} from "./data-explorer-surface.fixture";

const FETCHED_AT = new Date("2024-01-01T23:00:00Z");

const SCHEMA_MAP_WIDE_VIEWPORT = { height: 1320, width: 1420 };

function pageContent(page: Page) {
  return page.getByRole("main").last();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FETCHED_AT);
});

test.describe("schema overview", () => {
  test("keeps dense table summaries scannable", async ({ page }) => {
    await mockExplorerSurfaces(page, { schemas: [SCHEMA_SUMMARY] });
    await page.goto(explorerUrl({ schema: SCHEMA_SUMMARY.name }));

    await expect(
      page.getByRole("cell", { name: "fact_customer_activity_rollup" })
    ).toBeVisible();
    await expect(page.getByRole("cell", { name: "1.3 GB" })).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot(
      "schema-detail-summary.png"
    );
  });
});

test.describe("schema map", () => {
  test("shows relationships and the selected table", async ({ page }) => {
    await page.setViewportSize(SCHEMA_MAP_WIDE_VIEWPORT);
    await mockExplorerSurfaces(page, { schemas: SCHEMA_MAP_SCHEMAS });
    await page.goto(explorerUrl({ schema: "shipping", tab: "map" }));

    await test.step("initial map", async () => {
      await expect(
        page.getByRole("button", { name: "shipping.containers" })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "catalog.routes" })
      ).toBeHidden();
      await expect(pageContent(page)).toHaveScreenshot("schema-map.png");
    });

    await test.step("selected table", async () => {
      await page.getByRole("button", { name: "shipping.shipments" }).click();
      await expect(
        page.getByRole("button", { name: "Open data" })
      ).toBeVisible();
      await expect(pageContent(page)).toHaveScreenshot(
        "schema-map-selected-table.png"
      );
    });
  });
});

test.describe("view detail", () => {
  test("materialized view stays readable", async ({ page }) => {
    await mockExplorerSurfaces(page, { schemas: [MATERIALIZED_VIEW_SCHEMA] });
    await page.goto(
      explorerUrl({
        category: "views",
        name: "customer_success_daily_rollups",
        schema: "public",
      })
    );

    await expect(
      page.getByText("Materialized view · owner: analytics_owner")
    ).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot("view-detail.png");
  });
});
