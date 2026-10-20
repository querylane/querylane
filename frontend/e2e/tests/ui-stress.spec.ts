import type { Locator } from "playwright/test";
import { consoleInstance } from "../../src/test/fixtures/console-resource-fixtures";
import { roleDetailFixture } from "../../src/test/fixtures/role-fixtures";
import {
  CONFIGURATION_URL,
  mockConsoleResources,
} from "../visual/console-resource-fixtures";
import { mockRolesScreen } from "../visual/role-fixtures";
import { expect, test } from "./base";
import { mockRpc } from "./helpers";

const VERIFY_FULL = /^verify-full/u;
const GRANTS = /^Grants/u;
const SQL_EDITOR = /^SQL editor/u;

const MAX_LENGTH_INSTANCE_NAME =
  "production_analytics_eu_central_failover_readonly_reconciliatio";

async function expectWithin(element: Locator, container: Locator) {
  const bounds = await element.boundingBox();
  const frame = await container.boundingBox();
  expect(bounds).not.toBeNull();
  expect(frame).not.toBeNull();
  if (!(bounds && frame)) {
    throw new Error("Missing layout bounds");
  }
  expect(bounds.x).toBeGreaterThanOrEqual(frame.x - 1);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(
    frame.x + frame.width + 1
  );
}

for (const width of [320, 640]) {
  test(`configuration preserves long identity and actions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockConsoleResources(page, {
      instance: { ...consoleInstance, displayName: MAX_LENGTH_INSTANCE_NAME },
    });
    await page.goto(CONFIGURATION_URL);
    const heading = page.getByRole("heading", {
      name: MAX_LENGTH_INSTANCE_NAME,
      exact: true,
    });
    await expect(heading).toBeVisible();
    await expectWithin(heading, page.getByRole("main").last());
    const danger = page.getByTestId("instance-danger-zone");
    const remove = page.getByRole("button", {
      name: "Delete instance",
      exact: true,
    });
    await danger.scrollIntoViewIfNeeded();
    await expectWithin(remove, danger);
    await remove.click();
    const dialog = page.getByRole("alertdialog", { name: "Delete instance?" });
    await expect(dialog).toBeVisible();
    await expectWithin(dialog.getByRole("textbox"), dialog);
    await expectWithin(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
      dialog
    );
    await expectWithin(
      dialog.getByRole("button", { name: "Delete instance", exact: true }),
      dialog
    );
    await expect(
      dialog.getByRole("button", { name: "Delete instance", exact: true })
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(remove).toBeFocused();
  });
}

test("SSL choices stay within a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockConsoleResources(page);
  await page.goto(CONFIGURATION_URL);
  await expect(
    page.getByRole("combobox", { name: "SSL mode", exact: true })
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("combobox", { name: "SSL mode", exact: true }).click();
  const options = page.getByRole("listbox");
  await expect(options).toBeVisible();
  const bounds = await options.boundingBox();
  if (!bounds) {
    throw new Error("Missing menu bounds");
  }
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  await page.getByRole("option", { name: VERIFY_FULL }).click();
  await expect(
    page.getByRole("combobox", { name: "SSL mode", exact: true })
  ).toContainText("verify-full");
});

test("role tab navigation scrolls only the tab strip", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockRolesScreen(page, roleDetailFixture());
  await page.goto("/instances/production/roles/app_user?tab=grants");
  const heading = page.getByRole("heading", { name: "app_user", exact: true });
  await expect(heading).toBeVisible();
  const before = await heading.boundingBox();
  await page.getByRole("tab", { name: GRANTS }).focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(page.getByText("SQL definition", { exact: true })).toBeVisible();
  const after = await heading.boundingBox();
  if (!(before && after)) {
    throw new Error("Missing heading bounds");
  }
  expect(after.x).toBe(before.x);
  await expectWithin(
    page.getByRole("tab", { name: "Definition", exact: true }),
    page.getByRole("main").last()
  );
});

test("SQL tabs support keyboard selection, panels, and external actions", async ({
  page,
  makeAxeBuilder,
}) => {
  await mockConsoleResources(page);
  await page.goto("/instances/production/databases/appdb/workbench");
  const editor = page.getByRole("textbox", { name: SQL_EDITOR });
  await expect(editor).toBeVisible();
  await page
    .getByRole("button", { name: "New query tab", exact: true })
    .click();
  const queryTabs = page.getByRole("tablist", {
    name: "Query tabs",
    exact: true,
  });
  const tabs = queryTabs.getByRole("tab");
  await expect(tabs).toHaveCount(2);
  await tabs.last().focus();
  await page.keyboard.press("Home");
  await expect(tabs.first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  const panelId = await tabs.first().getAttribute("aria-controls");
  expect(panelId).toBeTruthy();
  await expect(
    page.getByRole("tabpanel").filter({ has: editor })
  ).toHaveAttribute("id", panelId ?? "");
  const awaitedResult1 = await makeAxeBuilder()
    .include('[role="tablist"]')
    .analyze();
  expect(awaitedResult1.violations).toEqual([]);
  await page
    .getByRole("button", { name: "Close Query 1", exact: true })
    .click();
  await expect(tabs).toHaveCount(1);
  await expect(tabs.first()).toBeFocused();
});

test("a narrow SQL editor remains keyboard-scrollable", async ({
  page,
  makeAxeBuilder,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockConsoleResources(page);
  await mockRpc(page, "SQLService/ValidateQuery", {});
  await page.goto("/instances/production/databases/appdb/workbench");
  await page
    .getByRole("textbox", { name: SQL_EDITOR })
    .fill(
      "SELECT carrier_id, shipment_id, expected_delivery_time FROM shipping.shipments;"
    );
  const awaitedResult2 = await makeAxeBuilder()
    .include(".cm-scroller")
    .analyze();
  expect(awaitedResult2.violations).toEqual([]);
});

test("connection and create actions remain reachable on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockConsoleResources(page);
  await page.goto("/new-instance");
  const testConnection = page.getByRole("button", {
    name: "Test connection",
    exact: true,
  });
  await expect(testConnection).toBeVisible();
  await testConnection.scrollIntoViewIfNeeded();
  await expectWithin(testConnection, page.getByTestId("create-instance-page"));
  await expectWithin(
    page.getByRole("button", { name: "Create instance", exact: true }),
    page.getByTestId("create-instance-page")
  );
});
