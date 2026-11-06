import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import {
  DataTableDefaultScenario,
  DataTableSortedFilteredScenario,
} from "@/visual-harness/data-grid-scenarios";

// Pixels live in e2e/visual/data-table.spec.ts.
test("data table renders an unsorted metadata table by default", async () => {
  await render(
    <ScreenshotFrame>
      <DataTableDefaultScenario />
    </ScreenshotFrame>
  );

  await expect.element(page.getByText("Database instances")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Instance, not sorted" }))
    .toBeVisible();
});

test("data table applies initial sorting and a controlled filter", async () => {
  await render(
    <ScreenshotFrame>
      <DataTableSortedFilteredScenario />
    </ScreenshotFrame>
  );

  await expect
    .element(page.getByRole("button", { name: "Instance, sorted ascending" }))
    .toBeVisible();
  await expect.element(page.getByText("analytics")).toBeVisible();
});
