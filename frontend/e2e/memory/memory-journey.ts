import { expect, type Page } from "playwright/test";
import { mockRoles, mockRpc } from "../tests/helpers";
import { mockConsoleResources } from "../visual/console-resource-fixtures";
import {
  DATA_GRID_TABLE_URL,
  mockDataGridExplorer,
} from "../visual/data-grid-fixtures";

const WORKBENCH = /\/instances\/production\/databases\/appdb\/sql(?:\?|$)/u;
const INSTANCE = /\/instances\/production(?:\?|$)/u;
const CONNECTIONS = /Connections/u;
const SQL_TARGET = /^SQL workbench/u;
const INSTANCE_TARGET = /^Instance overview/u;
const SQL_EDITOR = /^SQL editor, /u;

export const MEMORY_FIXTURE_ID = "console-metrics-and-orders-grid-v1";
export async function prepareMemoryJourney(page: Page, origin: string) {
  await mockConsoleResources(page, { metrics: true });
  await mockDataGridExplorer(page);
  await mockRoles(page);
  await mockRpc(page, "SQLService/ValidateQuery", {});
  await page.goto(`${origin}${DATA_GRID_TABLE_URL}`);
  const cell = page.getByRole("gridcell", {
    name: "arun.patel@example.com",
    exact: true,
  });
  await expect(cell).toBeVisible();
  return async () => {
    await page
      .getByRole("button", { name: "Search or jump to…", exact: true })
      .click();
    const palette = page.getByRole("dialog", {
      name: "Search or jump to",
      exact: true,
    });
    await expect(palette).toBeVisible();
    await palette.getByRole("combobox").fill("SQL workbench");
    await palette.getByRole("option", { name: SQL_TARGET }).click();
    await expect(palette).toBeHidden();
    await expect(page).toHaveURL(WORKBENCH);
    const editor = page.getByRole("textbox", {
      name: SQL_EDITOR,
    });
    await editor.fill("SELECT 1;");
    await expect(editor).toHaveText("SELECT 1;");
    await page
      .getByRole("button", { name: "Search or jump to…", exact: true })
      .click();
    await palette.getByRole("combobox").fill("Instance overview");
    await palette.getByRole("option", { name: INSTANCE_TARGET }).click();
    await expect(palette).toBeHidden();
    await expect(page).toHaveURL(INSTANCE);
    // Proves populated metrics, not a pending card or an empty-state fallback.
    const connections = page.getByRole("tab", { name: CONNECTIONS });
    await connections.click();
    await expect(connections).toHaveAttribute("aria-selected", "true");
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByRole("alert")).toHaveCount(0);
    await expect(
      panel.getByRole("status", { name: "Loading metric chart" })
    ).toBeHidden();
    await expect(
      panel.getByRole("img", { name: "Metric time series", exact: true })
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(WORKBENCH);
    await expect(editor).toBeVisible();
    await page.goBack();
    await expect(cell).toBeVisible();
    await page
      .getByRole("button", { name: "Search or jump to…", exact: true })
      .click();
    await expect(palette).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
    await expect(cell).toBeVisible();
  };
}
