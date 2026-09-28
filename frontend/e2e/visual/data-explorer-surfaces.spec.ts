import type { Page } from "playwright/test";
import {
  MATERIALIZED_VIEW_SCHEMA,
  SALES_SCHEMA,
  SCHEMA_MAP_SCHEMAS,
  SCHEMA_SUMMARY,
  STALE_CATALOG_SCHEMA,
  STANDARD_VIEW_SCHEMA,
  VIEW_NOTICES,
} from "../../src/test/fixtures/data-explorer-surface-fixtures";
import { expect, test } from "../tests/base";
import {
  explorerUrl,
  mockExplorerSurfaces,
} from "./data-explorer-surface-fixtures";

// Schema overview, schema map, and view detail surfaces of the data explorer.
// Table detail tabs live in data-explorer-table-surfaces.spec.ts.

const FETCHED_AT = new Date("2024-01-01T23:00:00Z");
const KIND_FILTER_RE = /^Kind$/;
const OWNER_FILTER_RE = /^Owner$/;
const ACTIVE_KIND_FILTER_RE = /^Kind.*Materialized views/;
const ACTIVE_OWNER_FILTER_RE = /^Owner.*analytics_owner/;
const SCHEMA_MAP_FILTER_RE = /^Schema$/;
const SCHEMA_MAP_WIDE_VIEWPORT = { height: 1320, width: 1420 };
const SCHEMA_MAP_NARROW_VIEWPORT = { height: 1000, width: 900 };

// Page content only: the app shell has its own visual coverage.
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

  test("captures active object filters", async ({ page }) => {
    await mockExplorerSurfaces(page, { schemas: [SALES_SCHEMA] });
    await page.goto(explorerUrl({ schema: SALES_SCHEMA.name }));
    const heading = page.getByRole("heading", { exact: true, name: "sales" });

    await test.step("filter by kind", async () => {
      await page.getByRole("button", { name: KIND_FILTER_RE }).click();
      await page.getByRole("option", { name: "Materialized views" }).click();
      await heading.click();
    });

    await test.step("filter by owner", async () => {
      await page.getByRole("button", { name: OWNER_FILTER_RE }).click();
      await page.getByRole("option", { name: "analytics_owner" }).click();
      await heading.click();
    });

    await expect(
      page.getByRole("button", { name: ACTIVE_KIND_FILTER_RE })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: ACTIVE_OWNER_FILTER_RE })
    ).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot(
      "schema-detail-active-filters.png"
    );
  });

  test("highlights stale catalog warnings", async ({ page }) => {
    await mockExplorerSurfaces(page, { schemas: [STALE_CATALOG_SCHEMA] });
    await page.goto(explorerUrl({ schema: STALE_CATALOG_SCHEMA.name }));

    await expect(
      pageContent(page).getByText("Showing cached catalog. Refresh failed.")
    ).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot(
      "schema-detail-sync-warning.png"
    );
  });
});

test.describe("schema map", () => {
  test("shows relationships and the selected table", async ({ page }) => {
    await page.setViewportSize(SCHEMA_MAP_WIDE_VIEWPORT);
    await mockExplorerSurfaces(page, { schemas: SCHEMA_MAP_SCHEMAS });
    await page.goto(explorerUrl({ schema: "shipping", tab: "map" }));

    await test.step("initial map", async () => {
      // The explorer scopes the map to the active schema.
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

  test("uses a compact schema filter at narrow widths", async ({ page }) => {
    await page.setViewportSize(SCHEMA_MAP_NARROW_VIEWPORT);
    await mockExplorerSurfaces(page, { schemas: SCHEMA_MAP_SCHEMAS });
    await page.goto(explorerUrl({ schema: "shipping", tab: "map" }));

    await expect(
      page.getByRole("button", { name: SCHEMA_MAP_FILTER_RE })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "shipping.shipments" })
    ).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot(
      "schema-map-compact-toolbar.png"
    );
  });

  test("animates connected relationships when motion is allowed", async ({
    page,
  }) => {
    // Rstest browser mode forces reduced motion, so the dash animation that
    // marks connected edges is only checked here.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await mockExplorerSurfaces(page, { schemas: SCHEMA_MAP_SCHEMAS });
    await page.goto(explorerUrl({ schema: "shipping", tab: "map" }));

    await page.getByRole("button", { name: "shipping.shipments" }).click();
    const edges = [
      "shipments.carrier_id references carriers.id",
      "containers.shipment_id references shipments.id",
    ].map((label) => page.locator(`path[aria-label="${label}"]`));
    await Promise.all(
      edges.flatMap((edge) => [
        expect(edge).toHaveCSS("animation-duration", "0.5s"),
        expect(edge).toHaveCSS("animation-iteration-count", "infinite"),
        expect(edge).not.toHaveCSS("animation-name", "none"),
      ])
    );
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

  test("notice check displays returned notices", async ({ page }) => {
    await mockExplorerSurfaces(page, {
      explainNotices: VIEW_NOTICES,
      schemas: [STANDARD_VIEW_SCHEMA],
    });
    await page.goto(
      explorerUrl({
        category: "views",
        name: "daily_paid_revenue",
        schema: "public",
      })
    );

    await page.getByRole("button", { name: "Check database notices" }).click();
    await expect(
      page.getByText("HINT: Refresh the view if estimates look stale")
    ).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot("view-notices.png");
  });
});
