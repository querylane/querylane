import {
  LONG_DATABASE_NAME,
  LONG_INSTANCE_NAME,
} from "../fixtures/console-resource.fixture";
import { expect, test } from "../journeys/browser.test-utils";
import { openAdminShell } from "./console-resource.fixture";

const INSTANCE_SELECTOR_NAME = /^Instance:/u;
const DESKTOP_VIEWPORT = { height: 800, width: 1280 };
const DRAWER_WIDTH = 288;

test.describe("desktop shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
  });

  test("shows the selected instance, database, and scoped navigation", async ({
    page,
  }) => {
    await openAdminShell(page);

    await expect(
      page.getByRole("button", { name: INSTANCE_SELECTOR_NAME })
    ).toBeVisible();
    await expect(page.getByText(LONG_INSTANCE_NAME).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Collapse sidebar" })
    ).toBeVisible();
    await expect(page).toHaveScreenshot("admin-shell-database-scope.png");
  });

  test("command palette opens over the full layout", async ({ page }) => {
    await openAdminShell(page);

    await page.getByRole("button", { name: "Search or jump to" }).click();
    const dialog = page.getByRole("dialog", { name: "Search or jump to" });
    await expect(
      dialog.getByText(`${LONG_DATABASE_NAME}.public.shipments`)
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      "admin-command-palette-layout-open.png"
    );
  });

  test("degraded mode banner starts after the sidebar", async ({ page }) => {
    await openAdminShell(page, { degraded: true });

    const banner = page
      .locator("div")
      .filter({ has: page.getByText("Meta database unavailable.") })
      .filter({
        has: page.getByRole("button", { name: "Reconfigure internal storage" }),
      })
      .last();
    await expect(banner).toBeVisible();
    const bannerBox = await banner.boundingBox();
    const sidebarBox = await page
      .locator('[data-slot="sidebar-container"]')
      .boundingBox();
    expect(sidebarBox?.width ?? 0).toBeGreaterThan(0);
    expect(bannerBox?.x ?? 0).toBeGreaterThanOrEqual(
      (sidebarBox?.x ?? 0) + (sidebarBox?.width ?? 0) - 1
    );

    await test.step("banner", async () => {
      await expect(page).toHaveScreenshot("admin-shell-degraded-mode.png");
    });

    await test.step("recovery dialog", async () => {
      await page
        .getByRole("button", { name: "Reconfigure internal storage" })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Reconfigure internal storage",
      });
      await expect(
        dialog.getByText("querylane server reset-config", { exact: false })
      ).toBeVisible();
      await expect(dialog).toHaveScreenshot(
        "internal-storage-recovery-dialog.png"
      );
    });
  });
});

for (const { name, width } of [{ name: "phone", width: 320 }] as const) {
  test.describe(`${name} shell`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ height: 900, width });
    });

    test("navigation drawer keeps its width and closes from the keyboard", async ({
      page,
    }) => {
      await openAdminShell(page);

      const trigger = page.getByRole("button", {
        name: "Open navigation menu",
      });
      await trigger.click();
      const drawer = page.getByRole("dialog");
      await expect(drawer).toBeVisible();
      const awaitedResult1 = await drawer.boundingBox();
      expect(awaitedResult1?.width).toBe(DRAWER_WIDTH);
      await expect(drawer).toHaveScreenshot(
        `admin-navigation-open-${width}.png`
      );

      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      await expect(trigger).toBeFocused();
    });
  });
}
