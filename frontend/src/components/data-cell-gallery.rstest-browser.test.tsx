import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { DataCellGalleryScenario } from "@/visual-harness/data-grid-scenarios";

// Pixels live in e2e/visual/data-table.spec.ts (scenario "data-cell-gallery").
test("data grid cells distinguish text, numeric, boolean, json, bytes, date, and null values", async () => {
  await render(
    <ScreenshotFrame>
      <DataCellGalleryScenario />
    </ScreenshotFrame>
  );

  await expect.element(page.getByText("Data cell rendering")).toBeVisible();
  await expect.element(page.getByText("123456789")).toBeVisible();
  await expect.element(page.getByText("NULL", { exact: true })).toBeVisible();
  await expect
    .element(page.getByText("Connected", { exact: true }))
    .toBeVisible();
});
