import type { Page } from "playwright/test";
import { expect, test } from "../tests/base";

// Isolated data table and cell states rendered by src/visual-harness. Behavior
// for the same scenarios is covered in data-table.browser.test.tsx,
// data-table-filter-toolbar.browser.test.tsx, and
// data-cell-gallery.browser.test.tsx.
async function openScenario(page: Page, scenario: string) {
  await page.goto(`/visual.html?scenario=${scenario}`);
  const frame = page.getByTestId("visual-frame");
  await expect(frame).toBeVisible();
  return frame;
}

test("data table shows an unsorted metadata table by default", async ({
  page,
}) => {
  const frame = await openScenario(page, "data-table-default");
  await expect(
    frame.getByRole("button", { name: "Instance, not sorted" })
  ).toBeVisible();
  await expect(frame).toHaveScreenshot("data-table-default.png");
});

test("data table shows sorted and filtered rows", async ({ page }) => {
  const frame = await openScenario(page, "data-table-sorted-filtered");
  await expect(
    frame.getByRole("button", { name: "Instance, sorted ascending" })
  ).toBeVisible();
  await expect(frame).toHaveScreenshot("data-table-sorted-filtered.png");
});

test("active filter toolbar keeps search and facet chips aligned", async ({
  page,
}) => {
  const frame = await openScenario(page, "data-table-active-filter-toolbar");
  await expect(frame.getByRole("button", { name: "Clear all" })).toBeVisible();
  await expect(frame.getByTestId("filter-toolbar-visual")).toHaveScreenshot(
    "data-table-filter-toolbar-active.png"
  );
});

test("data cells keep typed PostgreSQL values distinct", async ({ page }) => {
  const frame = await openScenario(page, "data-cell-gallery");
  await expect(frame.getByText("NULL", { exact: true })).toBeVisible();
  await expect(frame).toHaveScreenshot("data-cell-gallery.png");
});
