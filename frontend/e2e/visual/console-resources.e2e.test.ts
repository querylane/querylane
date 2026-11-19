import type { Page } from "playwright/test";

import {
  busyActivity,
  designExtensions,
} from "../fixtures/console-resource.fixture";
import { expect, test } from "../journeys/browser.test-utils";
import {
  ACTIVITY_URL,
  CONFIGURATION_URL,
  EXTENSIONS_URL,
  INSTANCE_URL,
  mockConsoleResources,
} from "./console-resource.fixture";

const BLOCKED_ACTIVITY_ROW_NAME =
  /4302.*api-gateway.*UPDATE shipping\.shipments/u;
const PG_STAT_STATEMENTS_BUTTON_NAME = /pg_stat_statements/iu;
const REPLICATION_ROW_NAME = /Replication/u;
const SHARED_PRELOAD_LIBRARIES_TEXT = /Loaded via shared_preload_libraries/u;

const TALL_VIEWPORT = { height: 1800, width: 1280 };

const SERVER_PASSWORD_ERROR =
  "PostgreSQL rejected this password. Check the password, then try again.";

function pageContent(page: Page) {
  return page.getByRole("main").last();
}

function configurationCard(page: Page) {
  return innermost(page, '[data-slot="card"]', "Configuration");
}

function innermost(page: Page, selector: string, ...texts: string[]) {
  let locator = page.locator(selector);
  for (const text of texts) {
    locator = locator.filter({ has: page.getByText(text, { exact: true }) });
  }
  return locator.last();
}

test.describe("instance overview", () => {
  test.use({ viewport: TALL_VIEWPORT });

  test("live metrics and database catalog render together", async ({
    page,
  }) => {
    await mockConsoleResources(page);
    await page.goto(INSTANCE_URL);

    const health = page.getByRole("region", { name: "Health checks" });
    await expect(
      health.getByText("primary with 2 attached replicas")
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "74 of 100 connections in use" })
    ).toBeVisible();
    await expect(pageContent(page).getByText("customer_events")).toBeVisible();

    await health.getByRole("button", { name: REPLICATION_ROW_NAME }).click();
    await expect(health.getByText("Streaming replicas")).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot(
      "backend-instance-overview.png"
    );
    await expect(health).toHaveScreenshot(
      "backend-instance-overview-health.png"
    );
  });
});

test.describe("instance activity", () => {
  test("live sessions show blocking chains and the session inspector", async ({
    page,
  }) => {
    await mockConsoleResources(page, { activity: busyActivity });
    await page.goto(ACTIVITY_URL);

    await expect(page.getByText("blocker · pid 4211")).toBeVisible();
    await expect(page.getByText("Showing 1–5 of 5")).toBeVisible();
    await expect(
      page.locator('code.language-sql[data-syntax-highlighter="shiki"]')
    ).toHaveCount(8);

    await test.step("sessions table", async () => {
      await expect(pageContent(page)).toHaveScreenshot(
        "backend-instance-activity.png"
      );
    });

    await test.step("session inspector", async () => {
      await page
        .getByRole("button", { name: BLOCKED_ACTIVITY_ROW_NAME })
        .click();
      const inspector = page.getByRole("dialog", { name: "Session 4302" });
      await expect(inspector.getByText("Lock · transactionid")).toBeVisible();
      await expect(inspector.getByText("blocked by · pid 4211")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Terminate session…" })
      ).toHaveCount(0);

      const marker = inspector
        .locator('ol > li > [aria-hidden="true"]')
        .first();
      const markerPng = await marker.screenshot();
      const centerDifference = await page.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        if (!context) {
          return Number.POSITIVE_INFINITY;
        }
        context.drawImage(image, 0, 0);
        const centerX = Math.floor(image.width / 2);
        const centerY = Math.floor(image.height / 2);
        const offsetX = Math.min(image.width - 1, centerX + 2);
        const center = context.getImageData(centerX, centerY, 1, 1).data;
        const offset = context.getImageData(offsetX, centerY, 1, 1).data;
        return Math.max(
          ...Array.from(center, (channel, index) =>
            Math.abs(channel - (offset[index] ?? 0))
          )
        );
      }, markerPng.toString("base64"));
      expect(centerDifference).toBeLessThanOrEqual(1);

      await expect(inspector).toHaveScreenshot(
        "backend-instance-activity-inspector.png"
      );
    });
  });
});

test.describe("database extensions", () => {
  test("installed inventory and details drawer", async ({ page }) => {
    await mockConsoleResources(page, { extensions: designExtensions });
    await page.goto(EXTENSIONS_URL);

    await expect(page.getByText("Observability")).toBeVisible();
    await test.step("inventory", async () => {
      await expect(pageContent(page)).toHaveScreenshot(
        "backend-database-extensions.png"
      );
    });

    await test.step("details drawer", async () => {
      await page
        .getByRole("button", { name: PG_STAT_STATEMENTS_BUTTON_NAME })
        .click();
      const drawer = page.getByRole("dialog", {
        name: "pg_stat_statements details",
      });
      await expect(
        drawer.getByText(SHARED_PRELOAD_LIBRARIES_TEXT)
      ).toBeVisible();
      await drawer.getByRole("button", { name: "What it gives you" }).click();
      await expect(drawer.getByText("track_planning setting")).toBeVisible();
      await expect(drawer).toHaveScreenshot(
        "backend-database-extensions-drawer.png"
      );
    });
  });
});

test.describe("instance configuration", () => {
  test.use({ viewport: TALL_VIEWPORT });

  test("server field errors anchor to the rejected field", async ({ page }) => {
    await mockConsoleResources(page, {
      passwordRejection: SERVER_PASSWORD_ERROR,
    });
    await page.goto(CONFIGURATION_URL);

    const password = page.getByRole("textbox", { name: "Password" });
    await password.fill("wrong-password");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(
      pageContent(page).getByText(SERVER_PASSWORD_ERROR)
    ).toBeVisible();
    await expect(password).toBeFocused();
    await expect(password).toHaveAttribute("aria-invalid", "true");
    await expect(configurationCard(page)).toHaveScreenshot(
      "instance-config-server-field-errors.png"
    );
  });

  test("delete confirmation makes the destructive action explicit", async ({
    page,
  }) => {
    await mockConsoleResources(page);
    await page.goto(CONFIGURATION_URL);

    await page
      .getByTestId("instance-danger-zone")
      .getByRole("button", { name: "Delete instance" })
      .click();
    const dialog = page.getByRole("alertdialog");
    await expect(
      dialog.getByRole("heading", { name: "Delete instance?" })
    ).toBeVisible();
    await expect(dialog).toHaveScreenshot("instance-delete-confirmation.png");
  });
});
