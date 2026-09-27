import type { Page } from "playwright/test";
import { expect, test } from "../tests/base";

// Isolated presentational states rendered by src/visual-harness. Behavior for
// the same scenarios is covered in console-pages.rstest-browser.test.tsx.
async function openScenario(page: Page, scenario: string) {
  await page.goto(`/visual.html?scenario=${scenario}`);
  const frame = page.getByTestId("visual-frame");
  await expect(frame).toBeVisible();
  return frame;
}

test("resource overview keeps dense metadata readable", async ({ page }) => {
  const frame = await openScenario(page, "console-resource-overview");
  await expect(
    frame.getByText("analytics-writer.internal.querylane.test")
  ).toBeVisible();
  await expect(frame).toHaveScreenshot("console-resource-overview.png");
});

for (const slug of ["authentication", "permission", "availability"]) {
  test(`SQLSTATE ${slug} error stays scannable`, async ({ page }) => {
    const frame = await openScenario(page, "console-sqlstate");
    await expect(
      frame.getByTestId(`sqlstate-scenario-${slug}`)
    ).toHaveScreenshot(`console-sqlstate-${slug}.png`);
  });
}

test("empty states distinguish config-managed and actionable gaps", async ({
  page,
}) => {
  const frame = await openScenario(page, "console-empty-states");
  await expect(frame.getByText("No databases found")).toBeVisible();
  await expect(frame).toHaveScreenshot("console-empty-states.png");
});

test("page error keeps recovery actions scannable", async ({ page }) => {
  const frame = await openScenario(page, "console-page-error");
  await expect(
    frame.getByRole("button", { name: "Retry metadata" })
  ).toBeVisible();
  await expect(frame).toHaveScreenshot("console-page-error.png");
});
