import {
  ADMIN_SHELL_FIXTURE,
  CONSOLE_FIXED_NOW,
} from "../../src/test/fixtures/console-resource-fixtures";
import {
  DATABASE_URL,
  mockConsoleResources,
} from "../visual/console-resource-fixtures";
import {
  DATA_GRID_TABLE_URL,
  mockDataGridExplorer,
} from "../visual/data-grid-fixtures";
import { expect, test } from "./base";
import { mockRpc } from "./helpers";

const COMPLETION_GUARD_MS = 75;
const WORKBENCH_URL = `${DATABASE_URL}/workbench`;

test.beforeEach(async ({ browser, browserName, page }, testInfo) => {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
      await route.fallback();
      return;
    }
    await route.abort("blockedbyclient");
    throw new Error(
      `Unexpected nonfixture network request: ${url.origin}${url.pathname}`
    );
  });
  await page.route("https://api.github.com/**", (route) =>
    route.fulfill({ json: { stargazers_count: 1200 } })
  );
  await testInfo.attach("engine-identity", {
    body: JSON.stringify({ engine: browserName, version: browser.version() }),
    contentType: "application/json",
  });
});

test("SQL completion and indentation use native keyboard input", async ({
  page,
  checkAccessibility,
}) => {
  await mockConsoleResources(page, ADMIN_SHELL_FIXTURE);
  await mockRpc(page, "SQLService/ValidateQuery", {});
  await page.goto(WORKBENCH_URL);
  const editor = page.getByRole("textbox", { name: "SQL editor" });
  await editor.fill("SELECT * FROM ship");
  await expect(
    page.getByRole("option", { name: "shipment_event table", exact: true })
  ).toHaveAttribute("aria-selected", "true");
  // The fixture installs a Date-only clock before mount. Model the pinned
  // autocomplete interaction guard; timers and trusted input stay real.
  await page.clock.setFixedTime(
    new Date(CONSOLE_FIXED_NOW.getTime() + COMPLETION_GUARD_MS)
  );
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("option", { name: "shipments table", exact: true })
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Tab");
  await expect(editor).toHaveText("SELECT * FROM shipments");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(editor).toBeFocused();
  await editor.fill("SELECT 1;");
  await page.keyboard.press("Tab");
  await expect(editor).toHaveText("  SELECT 1;");
  await page.keyboard.press("Shift+Tab");
  await expect(editor).toHaveText("SELECT 1;");
  await checkAccessibility();
});

test("grid keyboard focus and native copy preserve the selected cell", async ({
  page,
  checkAccessibility,
}) => {
  await mockDataGridExplorer(page);
  await mockRpc(page, "SQLService/ValidateQuery", {});
  await page.goto(DATA_GRID_TABLE_URL);
  const cell = page.getByRole("gridcell", {
    name: "arun.patel@example.com",
    exact: true,
  });
  await cell.click();
  await expect(cell).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(cell).not.toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(cell).toBeFocused();
  // Native clipboard events plus a native paste verify payload, not a toast or
  // a mocked clipboard API. No engine-specific permission grants.
  await page.keyboard.press("ControlOrMeta+c");
  const filter = page.getByRole("textbox", { name: "Filter…", exact: true });
  await filter.fill("");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(filter).toHaveValue("arun.patel@example.com");
  await filter.fill("");
  await expect(cell).toBeVisible();
  await checkAccessibility();
});

test("mobile drawer restores focus and closes on keyboard navigation", async ({
  page,
  checkAccessibility,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockConsoleResources(page, ADMIN_SHELL_FIXTURE);
  await mockRpc(page, "SQLService/ValidateQuery", {});
  await page.goto(DATABASE_URL);
  const trigger = page.getByRole("button", { name: "Open navigation menu" });
  const drawer = page.getByRole("dialog", { name: "Sidebar" });
  await trigger.click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  await drawer
    .getByRole("link", { name: "SQL workbench", exact: true })
    .press("Enter");
  await expect(page).toHaveURL(WORKBENCH_URL);
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("textbox", { name: "SQL editor" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(DATABASE_URL);
  await expect(trigger).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(WORKBENCH_URL);
  await expect(page.getByRole("textbox", { name: "SQL editor" })).toBeVisible();
  await trigger.click();
  await expect(drawer).toBeVisible();
  await checkAccessibility();
});
