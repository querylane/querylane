import type { Page } from "playwright/test";
import { expect, test } from "../tests/base";

async function openPlan(page: Page) {
  await page.goto("/visual.html?scenario=query-plan");
  await expect(
    page.getByRole("button", {
      exact: true,
      name: "Inspect Seq Scan on shipments",
    })
  ).toHaveAttribute("aria-pressed", "true");
  return page.getByRole("region", { name: "Query plan demo" });
}

test("plan map and operators retain the selected scan and inspector", async ({
  page,
}) => {
  const plan = await openPlan(page);
  await expect(plan).toHaveScreenshot("plan-map.png");

  await page.getByRole("tab", { exact: true, name: "Operators" }).click();
  await expect(
    page.getByRole("table", { name: "Execution plan" })
  ).toBeVisible();
  await expect(plan).toHaveScreenshot("plan-operators.png");
});

test("focused plan keeps the map and diagnostic evidence together", async ({
  page,
}) => {
  await openPlan(page);
  await page.getByRole("button", { name: "Focus plan" }).click();

  const dialog = page.getByRole("dialog", { name: "Query plan" });
  await expect(
    dialog.getByRole("heading", { name: "Seq Scan", exact: true })
  ).toBeVisible();
  await expect(dialog).toHaveScreenshot("plan-focus.png");
});

test("phone plan focus stacks the map above its selected inspector", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await openPlan(page);
  await page.getByRole("button", { name: "Focus plan" }).click();

  const dialog = page.getByRole("dialog", { name: "Query plan" });
  await expect(
    dialog.getByRole("heading", { exact: true, name: "Seq Scan" })
  ).toBeVisible();
  await expect(dialog).toHaveScreenshot("plan-phone-focus.png");
});
