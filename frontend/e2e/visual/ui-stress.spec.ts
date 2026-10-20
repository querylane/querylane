import { consoleInstance } from "../../src/test/fixtures/console-resource-fixtures";
import { roleDetailFixture } from "../../src/test/fixtures/role-fixtures";
import { expect, test } from "../tests/base";
import {
  CONFIGURATION_URL,
  DATABASE_URL,
  mockConsoleResources,
} from "./console-resource-fixtures";
import { mockRolesScreen } from "./role-fixtures";

const LONG_IDENTITY =
  "production_analytics_eu_central_failover_readonly_reconciliatio";
const GRANTS = /^Grants/u;
const SQL_EDITOR = /^SQL editor/u;

for (const width of [320, 640]) {
  test(`long configuration identity and destructive confirmation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockConsoleResources(page, {
      instance: { ...consoleInstance, displayName: LONG_IDENTITY },
    });
    await page.goto(CONFIGURATION_URL);
    await expect(
      page.getByRole("heading", { name: LONG_IDENTITY, exact: true })
    ).toBeVisible();
    await expect(page.getByRole("main").last()).toHaveScreenshot(
      `configuration-${width}.png`
    );
    await expect(page.getByTestId("instance-danger-zone")).toHaveScreenshot(
      `danger-${width}.png`
    );
    await page
      .getByRole("button", { name: "Delete instance", exact: true })
      .click();
    await expect(page.getByRole("alertdialog")).toHaveScreenshot(
      `delete-${width}.png`
    );
  });
}

test("SSL descriptions fit a phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockConsoleResources(page);
  await page.goto(CONFIGURATION_URL);
  await page.getByRole("combobox", { name: "SSL mode", exact: true }).click();
  await expect(page.getByRole("listbox")).toHaveScreenshot("ssl-phone.png");
});

test("role summary and keyboard-selected definition fit a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockRolesScreen(page, roleDetailFixture());
  await page.goto("/instances/production/roles/app_user?tab=grants");
  await expect(
    page.getByRole("heading", { name: "app_user", exact: true })
  ).toBeVisible();
  await expect(page.getByRole("main").last()).toHaveScreenshot(
    "role-grants-phone.png"
  );
  await page.getByRole("tab", { name: GRANTS }).focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(page.getByText("SQL definition", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").last()).toHaveScreenshot(
    "role-definition-phone.png"
  );
});

for (const width of [320, 1280]) {
  test(`SQL query tabs expose separate collection actions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockConsoleResources(page);
    await page.goto(`${DATABASE_URL}/workbench`);
    await expect(page.getByRole("textbox", { name: SQL_EDITOR })).toBeVisible();
    await page
      .getByRole("button", { name: "New query tab", exact: true })
      .click();
    await expect(page.getByRole("main").last()).toHaveScreenshot(
      `sql-query-tabs-${width}.png`
    );
  });
}

test("invalid labels show every message on the rejected row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await mockConsoleResources(page);
  await page.goto("/new-instance");
  await page
    .getByRole("textbox", { name: "Display name", exact: true })
    .fill("Staging");
  await page
    .getByRole("textbox", { name: "Host", exact: true })
    .fill("db.example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page
    .getByRole("button", { name: "Show advanced options", exact: true })
    .click();
  await page.getByRole("button", { name: "Add label", exact: true }).click();
  const key = page.getByRole("textbox", { name: "Label key 1", exact: true });
  await key.fill("invalid key");
  await page
    .getByRole("textbox", { name: "Label value 1", exact: true })
    .fill("x".repeat(256));
  await page
    .getByRole("button", { name: "Test connection", exact: true })
    .click();
  await expect(key).toBeFocused();
  await expect(key.locator("..").locator("..")).toHaveScreenshot(
    "invalid-label-phone.png"
  );
  await expect(
    page
      .getByRole("button", { name: "Test connection", exact: true })
      .locator("..")
  ).toHaveScreenshot("create-actions-phone.png");
});
