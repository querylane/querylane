import type { Page } from "playwright/test";
import { expect, test } from "../tests/base";
import {
  EXPLORER_URL,
  MATERIALIZED_VIEW_URL,
  mockMaterializedViewData,
  mockSchemaLoadError,
} from "./explorer-states-fixtures";

// Data Explorer states. Layout and behavior assertions live in
// src/features/data-explorer/*.rstest-browser.test.tsx and
// src/features/database-visualization/database-structure-map.rstest-browser.test.tsx.

// Page content only: the app shell has its own visual coverage.
function pageContent(page: Page) {
  return page.getByRole("main").last();
}

test("schema load failure stays visibly retryable", async ({ page }) => {
  await mockSchemaLoadError(page);
  await page.goto(EXPLORER_URL);

  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Error details" })
  ).toBeVisible();
  await expect(pageContent(page)).toHaveScreenshot(
    "explorer-schema-load-error.png"
  );
});

test("materialized view data tab renders its grid", async ({ page }) => {
  await mockMaterializedViewData(page);
  await page.goto(MATERIALIZED_VIEW_URL);

  await expect(
    page.getByRole("heading", {
      name: "public.customer_success_daily_rollups",
    })
  ).toBeVisible();
  await expect(page.getByText("Northwind Labs")).toBeVisible();
  await expect(pageContent(page)).toHaveScreenshot(
    "explorer-materialized-view-data.png"
  );
});

test("expanded database structure map keeps dense metadata readable", async ({
  page,
}) => {
  await page.goto("/visual.html?scenario=database-structure-map");
  await expect(page.getByText("orders_tenant_read_policy")).toBeVisible();

  await test.step("show every resource in the expanded map", async () => {
    await page.getByRole("button", { name: "Resource filters" }).click();
    await page.getByRole("button", { name: "Show all resources" }).click();
    await page.getByRole("button", { name: "Expand database map" }).click();
  });

  const dialog = page.getByRole("dialog", { name: "Expanded database map" });
  await expect(dialog.getByText("orders_account_id_fkey")).toBeVisible();
  await expect(dialog.getByText("orders_audit_trigger")).toBeVisible();
  await expect(dialog.getByText("orders_metadata_gin_idx")).toBeVisible();
  await expect(dialog).toHaveScreenshot("explorer-structure-map-expanded.png");
});
