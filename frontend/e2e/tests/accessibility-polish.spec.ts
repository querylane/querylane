import {
  DATA_GRID_TABLE_URL,
  mockDataGridExplorer,
} from "../visual/data-grid-fixtures";
import { expect, test } from "./base";
import { mockDataExplorerApp } from "./data-explorer-fixtures";
import { mockOverviewSupportData, mockRpc } from "./helpers";

for (const theme of ["light", "dark"] as const) {
  test(`selected grid references retain full-page accessibility in ${theme}`, {
    tag: ["@feat:data-explorer", "@a11y"],
  }, async ({ page, checkAccessibility }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.route("https://api.github.com/**", (route) =>
      route.fulfill({ json: { stargazers_count: 1200 } })
    );
    await mockDataGridExplorer(page);
    await mockRpc(page, "SQLService/ValidateQuery", {});
    await page.goto(DATA_GRID_TABLE_URL);
    await expect(page.locator("html")).toHaveClass(new RegExp(theme, "u"));
    const email = page.getByRole("gridcell", {
      name: "arun.patel@example.com",
      exact: true,
    });
    await email.click();
    await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("Shift+ArrowLeft");
    const reference = page
      .getByRole("gridcell")
      .filter({
        has: page.getByRole("button", {
          name: "Open customer_id reference 214",
        }),
      })
      .first();
    await expect(reference).toHaveAttribute("data-cell-range-selected", "true");
    await expect(
      page.getByRole("link", { name: "Querylane on GitHub", exact: true })
    ).toBeVisible();
    await checkAccessibility();
  });
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [640, 1280]) {
    test(`definition text retains full-page accessibility in ${theme} at ${width}px`, {
      tag: ["@feat:data-explorer", "@a11y"],
    }, async ({ page, checkAccessibility }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ height: 900, width });
      await mockDataExplorerApp(page);
      await mockOverviewSupportData(page);
      await page.goto(
        "/instances/production/databases/appdb/explorer?schema=public&category=tables&name=orders&tab=definition"
      );
      await expect(page.locator("[data-shiki-token]").first()).toBeVisible();
      await checkAccessibility();
    });
  }

  test(`overflowing constraint SQL supports native keyboard scrolling in ${theme}`, {
    tag: ["@feat:data-explorer", "@a11y"],
  }, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ height: 450, width: 640 });
    await mockDataExplorerApp(page);
    await mockOverviewSupportData(page);
    await page.goto(
      "/instances/production/databases/appdb/explorer?schema=public&category=tables&name=orders&tab=definition"
    );
    const constraints = page.locator('[data-slot="card"]').filter({
      has: page.getByRole("heading", { name: "Constraints", exact: true }),
    });
    const sql = constraints.locator("pre");
    await expect(sql.locator("[data-shiki-token]").first()).toBeVisible();
    await expect
      .poll(() =>
        sql.evaluate((element) => element.scrollWidth > element.clientWidth)
      )
      .toBe(true);
    await constraints
      .getByRole("button", { name: "Copy SQL", exact: true })
      .focus();
    await page.keyboard.press("Shift+Tab");
    await expect(sql).toBeFocused();
    await page.keyboard.down("ArrowRight");
    try {
      await expect
        .poll(() => sql.evaluate((element) => element.scrollLeft))
        .toBeGreaterThan(0);
    } finally {
      await page.keyboard.up("ArrowRight");
    }
    await page.keyboard.press("Tab");
    await expect(
      constraints.getByRole("button", { name: "Copy SQL", exact: true })
    ).toBeFocused();
  });
}
