import type { Page } from "playwright/test";
import { expect, test } from "../tests/base";
import {
  ACCESS_MAP_ROLES,
  accessMapFixture,
  mockRolesScreen,
  ROLE_DETAIL_ROLES,
  ROLES_TABLE_ROLES,
  roleDetailFixture,
} from "./role-fixtures";

const ROLES_URL = "/instances/production/roles";
const ACCESS_MAP_URL = `${ROLES_URL}?tab=map`;
const ROLE_DETAIL_URL = `${ROLES_URL}/app_user`;
const VIEW_BUTTON_NAME_RE = /^View/;

// Page content only: the app shell has its own visual coverage.
function pageContent(page: Page) {
  return page.getByRole("main").last();
}

test.describe("roles list", () => {
  test("table shows an inline type filter and sortable role rows", async ({
    page,
  }) => {
    await mockRolesScreen(page, {
      fixture: accessMapFixture(),
      roles: ROLES_TABLE_ROLES,
    });
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
    await mockRolesScreen(page, {
      fixture: accessMapFixture(),
      roles: ACCESS_MAP_ROLES,
    });
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

  test("dense map starts with reduced edge filters", async ({ page }) => {
    await mockRolesScreen(page, {
      fixture: accessMapFixture(5),
      roles: ACCESS_MAP_ROLES,
    });
    await page.goto(ACCESS_MAP_URL);

    const viewButton = page.getByRole("button", {
      name: "View, 3 filters hidden",
    });
    await expect(viewButton).toHaveScreenshot(
      "roles-access-map-dense-trigger.png"
    );

    await viewButton.click();
    await expect(
      page.getByRole("dialog", { name: "Access filters" })
    ).toHaveScreenshot("roles-access-map-dense-filters.png");
  });

  test("partial results stay visibly qualified", async ({ page }) => {
    await mockRolesScreen(page, {
      fixture: { ...accessMapFixture(), truncated: ["ListRoleGrants"] },
      roles: ACCESS_MAP_ROLES,
    });
    await page.goto(ACCESS_MAP_URL);

    await expect(page.getByText("Some access data is not shown")).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot(
      "roles-access-map-partial.png"
    );
  });

  test("filter switches stay inside the popover on narrow viewports", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 812, width: 355 });
    await mockRolesScreen(page, {
      fixture: accessMapFixture(),
      roles: ACCESS_MAP_ROLES,
    });
    await page.goto(ACCESS_MAP_URL);

    await page.getByRole("button", { name: VIEW_BUTTON_NAME_RE }).click();
    const filters = page.getByRole("dialog", { name: "Access filters" });
    await expect(filters).toBeVisible();

    const filtersBox = await filters.boundingBox();
    const switches = filters.getByRole("switch");
    await expect(switches.first()).toBeVisible();
    const switchBoxes = await Promise.all(
      (await switches.all()).map((filterSwitch) => filterSwitch.boundingBox())
    );

    expect(filtersBox).not.toBeNull();
    expect(switchBoxes).not.toContain(null);
    const filtersRight = (filtersBox?.x ?? 0) + (filtersBox?.width ?? 0);
    for (const switchBox of switchBoxes) {
      expect((switchBox?.x ?? 0) + (switchBox?.width ?? 0)).toBeLessThanOrEqual(
        filtersRight
      );
    }
  });
});

test.describe("role detail", () => {
  for (const { heading, name, tab } of [
    { heading: "Role attributes", name: "overview", tab: "overview" },
    { heading: "Direct grants", name: "grants-overview", tab: "grants" },
    { heading: "Inherits from", name: "membership", tab: "members" },
    { heading: "SQL definition", name: "definition", tab: "definition" },
  ] as const) {
    test(`${name} tab`, async ({ page }) => {
      await mockRolesScreen(page, {
        fixture: roleDetailFixture(),
        roles: ROLE_DETAIL_ROLES,
      });
      await page.goto(`${ROLE_DETAIL_URL}?tab=${tab}`);

      await expect(
        page.getByRole("heading", { level: 1, name: "app_user" })
      ).toBeVisible();
      await expect(
        page.getByText(heading, { exact: true }).first()
      ).toBeVisible();
      await expect(pageContent(page)).toHaveScreenshot(
        `role-detail-${name}.png`
      );
    });
  }

  test("grants tab captures active shared filters", async ({ page }) => {
    await mockRolesScreen(page, {
      fixture: roleDetailFixture({
        extraGrants: [
          {
            grantor: "postgres",
            objectName: "recent_orders",
            objectType: "GRANT_OBJECT_TYPE_VIEW",
            privilege: "SELECT",
            schemaName: "public",
            withGrantOption: false,
          },
        ],
      }),
      roles: ROLE_DETAIL_ROLES,
    });
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

  test("access map keeps partial counts qualified", async ({ page }) => {
    await mockRolesScreen(page, {
      fixture: roleDetailFixture({
        truncated: [
          "ListPublicGrants",
          "ListRoleGrants",
          "ListRoleOwnedObjects",
        ],
      }),
      roles: ROLE_DETAIL_ROLES,
    });
    await page.goto(`${ROLE_DETAIL_URL}?tab=access-map`);

    await expect(page.getByText("Some access data is not shown")).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot(
      "role-detail-access-map-partial.png"
    );

    await page.getByRole("button", { name: "Expand access map" }).click();
    await expect(
      page.getByRole("dialog", { name: "Expanded access map" })
    ).toHaveScreenshot("role-detail-access-map-partial-expanded.png");
  });
});
