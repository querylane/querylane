import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { DataTableActiveFilterToolbarScenario } from "@/visual-harness/data-grid-scenarios";

// Pixels live in e2e/visual/data-table.spec.ts.
test("active filter toolbar shows search, facet chips, and clear all", async () => {
  await render(
    <ScreenshotFrame>
      <DataTableActiveFilterToolbarScenario />
    </ScreenshotFrame>
  );

  await expect
    .element(page.getByRole("textbox", { name: "Search databases..." }))
    .toHaveValue("customer");
  await expect
    .element(page.getByRole("button", { name: "Kind Regular" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Owner analytics" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Clear all" }))
    .toBeVisible();
});
