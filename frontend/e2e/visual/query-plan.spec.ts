import type { Page } from "playwright/test";
import { expect, test } from "../tests/base";

const SHIPMENTS_NODE_NAME = /^(?:Inspect )?Seq Scan\b.*\bshipments\b/u;
const SHIPMENT_ITEMS_NODE_NAME =
  /^(?:Inspect )?Index Scan\b.*\bshipment_items\b/u;

async function openPlan(page: Page) {
  await page.goto("/visual.html?scenario=query-plan");
  await expect(
    page.getByRole("button", {
      exact: true,
      name: SHIPMENTS_NODE_NAME,
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
  await expect(page.getByRole("button", { name: "Focus plan" })).toBeInViewport(
    { ratio: 1 }
  );
  await page.getByRole("button", { name: "Focus plan" }).click();

  const dialog = page.getByRole("dialog", { name: "Query plan" });
  await expect(
    dialog.getByRole("heading", { exact: true, name: "Seq Scan" })
  ).toBeVisible();
  await expect(dialog).toHaveScreenshot("plan-phone-focus.png");
});

test("timing and search keep operator inspection linked", async ({ page }) => {
  const plan = await openPlan(page);
  await page.getByRole("tab", { name: "Timing", exact: true }).click();
  await expect(
    page
      .getByRole("list", { name: "Operator work" })
      .getByRole("listitem")
      .first()
  ).toContainText("Seq Scan on shipments");
  await expect(plan).toHaveScreenshot("plan-timing.png");
  const search = page.getByRole("searchbox", { name: "Search plan operators" });
  await search.fill("shipment_items");
  await page
    .getByRole("list", { name: "Matching operators" })
    .getByRole("button")
    .click();
  await expect(
    page
      .getByRole("complementary", { name: "Plan node details" })
      .getByRole("heading", { name: "Index Scan", exact: true })
  ).toBeVisible();
  await expect(plan).toHaveScreenshot("plan-search.png");
  await search.fill("missing_operator");
  await expect(page.getByRole("status")).toHaveText("No matching operators.");
  await search.fill("");
  await page.getByRole("tab", { name: "Map", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: SHIPMENT_ITEMS_NODE_NAME,
      exact: true,
    })
  ).toHaveAttribute("aria-pressed", "true");
});

test("findings reveal collapsed operators and remain usable on phones", async ({
  page,
}) => {
  const plan = await openPlan(page);
  await page.getByRole("tab", { name: "Operators", exact: true }).click();
  await page.getByRole("button", { name: "Collapse Hash Join branch" }).click();
  await page.getByRole("button", { name: "Plan findings" }).click();
  await expect(page).toHaveScreenshot("plan-findings.png");
  await page
    .getByRole("menuitem", {
      name: "100× more rows Seq Scan on shipments",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Collapse Hash Join branch" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: SHIPMENTS_NODE_NAME,
      exact: true,
    })
  ).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ height: 844, width: 390 });
  await page.getByRole("tab", { name: "Timing", exact: true }).click();
  await expect(
    page
      .getByRole("list", { name: "Operator work" })
      .getByRole("listitem")
      .first()
  ).toBeInViewport();
  await expect(plan).toHaveScreenshot("plan-phone-timing.png");
});
