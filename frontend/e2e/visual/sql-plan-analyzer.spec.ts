import { expect, test } from "../tests/base";

const TIMING_CAVEAT = /Not a timeline/;
const TIMING_PROMPT = /Run Explain analyze for timings/;
const READABLE_CARD_WIDTH = 256;
const NARROW_VIEWPORT_WIDTH = 390;
const PARSE_ERROR = /could not be parsed/;

test("inspect query plan work, estimates, and raw details", async ({
  page,
  makeAxeBuilder,
}) => {
  await page.goto("/visual.html?scenario=sql-plan-analyzer");
  await page
    .getByRole("button", { name: "Inspect Seq Scan on customers" })
    .click();
  const inspector = page.getByRole("region", { name: "Selected node" });
  await expect(inspector.getByText("(region = 'west'::text)")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Plan insights" })
      .getByText("120 hits · 30 reads")
  ).toBeVisible();
  await expect(page).toHaveScreenshot("graph-inspector.png");
  await page.getByRole("button", { name: "About plan metrics" }).click();
  await expect(
    page.getByRole("dialog", { name: "Plan metrics" })
  ).toBeVisible();
  await expect(page).toHaveScreenshot("metric-notes.png");
  expect((await makeAxeBuilder().analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Plan metrics" })).toBeHidden();

  await page.getByRole("tab", { name: "Timing", exact: true }).click();
  await expect(page.getByText(TIMING_CAVEAT)).toBeVisible();
  await expect(page).toHaveScreenshot("timing.png");
  await page.getByRole("tab", { name: "Tree", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Show details for Index Scan on orders using orders_customer_id_idx",
    })
    .click();
  await expect(page.getByText("(customer_id = customers.id)")).toBeVisible();
  await expect(page).toHaveScreenshot("tree-details.png");
  await page.getByRole("tab", { name: "JSON", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText(
    '"Shared Hit Blocks": 120'
  );
  await expect(page).toHaveScreenshot("json.png");
});

test("estimated and unsupported plans show honest fallback states", async ({
  page,
}) => {
  await page.goto("/visual.html?scenario=sql-plan-estimates");
  await page.getByRole("tab", { name: "Timing", exact: true }).click();
  await expect(page.getByText(TIMING_PROMPT)).toBeVisible();
  await expect(page).toHaveScreenshot("estimates.png");
  await page.goto("/visual.html?scenario=sql-plan-raw");
  await expect(page.getByText(PARSE_ERROR)).toBeVisible();
  await expect(page.getByText("Unsupported plan output")).toBeVisible();
  await expect(page).toHaveScreenshot("raw-fallback.png");
});

test("narrow plan can be inspected and switched with the keyboard", async ({
  page,
  makeAxeBuilder,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/visual.html?scenario=sql-plan-analyzer");
  const node = page.getByRole("button", {
    name: "Inspect Index Scan on orders using orders_customer_id_idx",
  });
  await node.focus();
  await page.keyboard.press("Enter");
  await expect(node).toHaveAttribute("aria-pressed", "true");
  const inspector = page.getByRole("region", { name: "Selected node" });
  await inspector.scrollIntoViewIfNeeded();
  await expect(
    inspector.getByText("(customer_id = customers.id)")
  ).toBeVisible();
  await expect(page).toHaveScreenshot("narrow-inspector.png");
  const graph = page.getByRole("tab", { name: "Graph", exact: true });
  await graph.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Timing", exact: true })
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("tab", { name: "Timing", exact: true })
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(TIMING_CAVEAT)).toBeVisible();
  await expect(page).toHaveScreenshot("narrow-timing.png");
  expect((await makeAxeBuilder().analyze()).violations).toEqual([]);
});

test("deep plans keep readable, inspectable cards without widening the page", async ({
  page,
  makeAxeBuilder,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/visual.html?scenario=sql-plan-deep");
  const scan = page.getByRole("button", {
    name: "Inspect Seq Scan on pg_class",
  });
  const card = scan.locator("xpath=ancestor::article");
  await expect
    .poll(async () => (await card.boundingBox())?.width ?? 0)
    .toBeGreaterThanOrEqual(READABLE_CARD_WIDTH);
  await scan.click();
  await expect(scan).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => page.locator("body").evaluate((element) => element.scrollWidth))
    .toBe(NARROW_VIEWPORT_WIDTH);
  await expect(page).toHaveScreenshot("deep-narrow-graph.png");
  const inspector = page.getByRole("region", { name: "Selected node" });
  await inspector.scrollIntoViewIfNeeded();
  await expect(
    inspector.getByText("Seq Scan on pg_class", { exact: true })
  ).toBeVisible();
  expect((await makeAxeBuilder().analyze()).violations).toEqual([]);
});

test("findings reveal spills in a collapsed parallel plan and search keeps ancestors", async ({
  page,
  makeAxeBuilder,
}) => {
  await page.goto("/visual.html?scenario=sql-plan-spills");
  await page
    .getByRole("button", { name: "Collapse Gather", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Inspect Sort", exact: true })
  ).toBeHidden();
  await page
    .getByRole("button", { name: "Sort used disk · Sort", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Inspect Sort", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  const inspector = page.getByRole("region", { name: "Selected node" });
  await expect(
    inspector.getByText("external merge", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("Parallel timing is approximate.", { exact: true })
  ).toBeVisible();
  await expect(page).toHaveScreenshot("spill-inspector.png");
  await page
    .getByRole("searchbox", { name: "Find an operator" })
    .fill("events");
  await expect(
    page.getByRole("button", { name: "Inspect Gather", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Inspect Seq Scan on events",
      exact: true,
    })
  ).toBeVisible();
  await expect(page).toHaveScreenshot("operator-search.png");
  await page
    .getByRole("searchbox", { name: "Find an operator" })
    .fill("missing");
  await expect(
    page.getByText("No operators match.", { exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Inspect Sort", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  expect((await makeAxeBuilder().analyze()).violations).toEqual([]);
});
