import {
  DATA_GRID_TABLE_URL,
  mockDataGridExplorer,
} from "../visual/data-grid-fixtures";
import { expect, test } from "./base";
import { mockRpc } from "./helpers";

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
