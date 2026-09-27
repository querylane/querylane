import type { Page } from "playwright/test";
import { expect, test } from "../tests/base";
import {
  DATA_GRID_TABLE_URL,
  LONG_SCHEMA_CUSTOMERS_TABLE_NAME,
  LONG_SCHEMA_NAME,
  mockDataGridExplorer,
} from "./data-grid-fixtures";

// Behavior, geometry, and computed-style checks for these states live in
// table-data-grid.rstest-browser.test.tsx; this spec owns the pixels.

const NARROW_VIEWPORT = { height: 844, width: 390 };
const FOREIGN_KEY_TRIGGER_NAME = "Open customer_id reference 214";
// Pins the "Last fetched" toolbar label so route screenshots stay stable.
const FIXED_NOW = new Date("2026-08-12T09:15:00Z");

// Page content only: the app shell has its own visual coverage.
function pageContent(page: Page) {
  return page.getByRole("main").last();
}

async function openScenario(page: Page, scenario: string) {
  await page.goto(`/visual.html?scenario=${scenario}`);
  const frame = page.getByTestId("visual-frame");
  await expect(frame).toBeVisible();
  return frame;
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

  test("hidden columns leave the header row compact", async ({ page }) => {
    await mockDataGridExplorer(page);
    await openOrdersGrid(page);

    await page.getByRole("button", { exact: true, name: "Columns" }).click();
    const columnsDialog = page.getByRole("dialog", { name: "Manage columns" });
    await columnsDialog.getByRole("checkbox", { name: "customer_id" }).click();
    await page.keyboard.press("Escape");
    await expect(columnsDialog).toBeHidden();

    await expect(
      page.getByRole("button", { name: "Open options for column customer_id" })
    ).toBeHidden();
    await expect(pageContent(page)).toHaveScreenshot(
      "data-grid-native-column-layout.png"
    );
  });

  test("foreign key reference popover keeps the source table visible", async ({
    page,
  }) => {
    await mockDataGridExplorer(page);
    await openOrdersGrid(page);

    await page
      .getByRole("button", { name: FOREIGN_KEY_TRIGGER_NAME })
      .first()
      .click();
    const preview = page.getByRole("dialog", { name: "public.customers" });
    await expect(preview.getByText("Hanse Container Line")).toBeVisible();
    await expect(page).toHaveScreenshot(
      "foreign-key-reference-popover-layout.png"
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

test.describe("isolated data grid controls", () => {
  test("toolbar and pagination stay compact with an active selection", async ({
    page,
  }) => {
    const frame = await openScenario(page, "data-explorer-controls");
    await expect(frame.getByText("3 selected")).toBeVisible();
    await expect(frame.getByText("Page 3 of 6")).toBeVisible();
    await expect(frame).toHaveScreenshot("data-explorer-controls.png");
  });

  test("row detail drawer shows dense record context", async ({ page }) => {
    await openScenario(page, "record-detail-drawer");
    const drawer = page.getByRole("dialog", { name: "public.customers" });
    await expect(drawer.getByText("PK")).toBeVisible();
    await expect(drawer).toHaveScreenshot("record-detail-drawer.png");
  });

  test("active filters stay visible beside sort and refresh", async ({
    page,
  }) => {
    const frame = await openScenario(page, "data-grid-filtered-toolbar");
    await expect(frame.getByText("email ILIKE %@enterprise%")).toBeVisible();
    await expect(frame).toHaveScreenshot("data-explorer-filter-controls.png");
  });

  test("filter popover starts with an unapplied rule", async ({ page }) => {
    await openScenario(page, "data-grid-empty-filter-toolbar");
    await page.getByRole("button", { exact: true, name: "Filter" }).click();
    const popover = page.getByRole("dialog", {
      name: "Filter shipping.carriers",
    });
    await expect(popover.getByRole("button", { name: "Apply" })).toBeVisible();
    await expect(popover).toHaveScreenshot(
      "data-explorer-rules-filter-popover.png"
    );
  });

  test("advanced filter popover shows negation and regex controls", async ({
    page,
  }) => {
    await openScenario(page, "data-grid-advanced-filter-toolbar");
    await page.getByRole("button", { name: "Filter 1" }).click();
    const popover = page.getByRole("dialog", { name: "Filter rows" });
    await expect(
      popover.getByText("Regex (ignore case)", { exact: true })
    ).toBeVisible();
    await expect(popover).toHaveScreenshot(
      "data-explorer-advanced-filter-popover.png"
    );
  });

  test("column popover shows visible-column projection state", async ({
    page,
  }) => {
    await openScenario(page, "data-grid-column-projection-toolbar");
    await page.getByRole("button", { exact: true, name: "Columns" }).click();
    const popover = page.getByRole("dialog", { name: "Manage columns" });
    await expect(
      popover.getByRole("switch", { name: "Fetch visible columns only" })
    ).toBeChecked();
    await expect(popover).toHaveScreenshot(
      "data-explorer-column-projection-popover.png"
    );
  });

  test("filter popover fits a narrow, offset grid", async ({ page }) => {
    await openScenario(page, "data-grid-offset-filter-toolbar");
    await page.getByRole("button", { name: "Filter 1" }).click();
    const popover = page.getByRole("dialog", { name: "Filter rows" });
    await expect(
      popover.getByRole("button", { name: "Remove filter" })
    ).toBeVisible();
    await expect(popover).toHaveScreenshot(
      "data-explorer-filter-popover-narrow.png"
    );
  });

  test("expanded data value opens a single dialog layer", async ({ page }) => {
    await openScenario(page, "data-value-dialog-guard");
    await page
      .getByRole("button", { name: "View full JSON for metadata" })
      .click();
    const dialog = page.getByRole("dialog", { name: "metadata JSON" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveScreenshot("data-value-dialog-single-layer.png");
  });
});
