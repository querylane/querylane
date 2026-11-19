import type { Page } from "playwright/test";
import {
  accessMapFixture,
  filteredRoleGrantsFixture,
  ROLES_TABLE_ROLES,
} from "../fixtures/role.fixture";
import { expect, test } from "../journeys/browser.test-utils";
import { mockRolesScreen } from "./role.fixture";

const ROLES_URL = "/instances/production/roles";
const ACCESS_MAP_URL = `${ROLES_URL}?tab=map`;
const ROLE_DETAIL_URL = `${ROLES_URL}/app_user`;

function pageContent(page: Page) {
  return page.getByRole("main").last();
}

test.describe("roles list", () => {
  test("table shows an inline type filter and sortable role rows", async ({
    page,
  }) => {
    await mockRolesScreen(page, accessMapFixture({ roles: ROLES_TABLE_ROLES }));
    await page.goto(ROLES_URL);

    await expect(
      page.getByRole("heading", { level: 1, name: "Roles" })
    ).toBeVisible();
    await expect(page.getByText("app_user", { exact: true })).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot("roles-table.png");
  });
});

test.describe("roles access map", () => {
  test("matches the design source across view states", async ({ page }) => {
    await mockRolesScreen(page, accessMapFixture());
    await page.goto(ACCESS_MAP_URL);
    await expect(page.getByText("shipping", { exact: true })).toBeVisible();

    await test.step("view filters open", async () => {
      await page.getByRole("button", { exact: true, name: "View" }).click();
      await expect(page.getByText("Built-in roles")).toBeVisible();
      await expect(pageContent(page)).toHaveScreenshot(
        "roles-access-map-view.png"
      );
    });

    await test.step("default map", async () => {
      await page.getByRole("button", { exact: true, name: "View" }).click();
      await expect(page.getByText("Built-in roles")).toBeHidden();
      await expect(pageContent(page)).toHaveScreenshot("roles-access-map.png");
    });

    await test.step("traced node", async () => {
      await page
        .getByRole("button", { name: "Trace access for cloud_admin" })
        .click();
      await expect(pageContent(page)).toHaveScreenshot(
        "roles-access-map-selected-node.png"
      );
    });
  });
});

test.describe("role detail", () => {
  test("grants tab captures active shared filters", async ({ page }) => {
    await mockRolesScreen(page, filteredRoleGrantsFixture());
    await page.goto(
      `${ROLE_DETAIL_URL}?tab=grants&grantsSchema=public&grantsType=tables`
    );

    await page.getByRole("textbox", { name: "Search objects…" }).fill("orders");
    await expect(page.getByRole("button", { name: "Clear all" })).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "public.orders" })
    ).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot(
      "role-detail-grants-active-filters.png"
    );
  });
});
