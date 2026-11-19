import type { Page } from "playwright/test";
import { expect, test } from "../journeys/browser.test-utils";
import {
  DATA_GRID_TABLE_URL,
  LONG_SCHEMA_CUSTOMERS_TABLE_NAME,
  LONG_SCHEMA_NAME,
  mockDataGridExplorer,
} from "./data-grid.fixture";

const NARROW_VIEWPORT = { height: 844, width: 390 };
const FOREIGN_KEY_TRIGGER_NAME = "Open customer_id reference 214";

const FIXED_NOW = new Date("2026-08-12T09:15:00Z");

function pageContent(page: Page) {
  return page.getByRole("main").last();
}

async function openOrdersGrid(page: Page) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto(DATA_GRID_TABLE_URL);
  await expect(page.getByText("arun.patel@example.com")).toBeVisible();
}

test.describe("data explorer table route", () => {
  test("failed page loads keep prior rows visibly stale", async ({ page }) => {
    await mockDataGridExplorer(page, { failNextPage: true });
    await openOrdersGrid(page);

    await page.getByRole("button", { name: "Next page" }).click();

    await expect(
      page.getByText("Showing the last loaded rows until retry succeeds.")
    ).toBeVisible();
    await expect(page.getByText("arun.patel@example.com")).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot(
      "data-grid-stale-rows-after-page-failure.png"
    );
  });

  test("foreign key reference popover fits a narrow viewport", async ({
    page,
  }) => {
    await page.setViewportSize(NARROW_VIEWPORT);
    await mockDataGridExplorer(page, {
      referencedTableName: LONG_SCHEMA_CUSTOMERS_TABLE_NAME,
    });
    await openOrdersGrid(page);

    await page
      .getByRole("button", { name: FOREIGN_KEY_TRIGGER_NAME })
      .first()
      .click();
    const preview = page.getByRole("dialog", {
      name: `${LONG_SCHEMA_NAME}.customers`,
    });
    await expect(preview.getByText("Hanse Container Line")).toBeVisible();

    await test.step("popover stays inside the viewport", async () => {
      const box = await preview.boundingBox();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
        NARROW_VIEWPORT.width
      );
      const titleOverflows = await preview
        .locator('[data-slot="popover-title"]')
        .evaluate((title) => title.scrollWidth > title.clientWidth);
      expect(titleOverflows).toBe(false);
    });

    await expect(page).toHaveScreenshot(
      "foreign-key-reference-popover-narrow-layout.png"
    );
  });
});
