import type { Page } from "playwright/test";

import { expect, test } from "../journeys/browser.test-utils";
import { mockOnboardingRequiredScenario } from "../journeys/onboarding.fixture";
import { mockReadyEmptyApp } from "../journeys/querylane-rpc.fixture";

const ADVANCED_CONNECTION_OPTIONS_RE = /Advanced connection options/u;

function onboardingPanel(page: Page) {
  return page.getByTestId("onboarding-panel");
}

async function openSetupMethod(page: Page, method: string, heading: string) {
  await mockOnboardingRequiredScenario(page);
  await page.goto(`/setup?method=${method}`);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
}

test.describe("setup wizard configure phases", () => {
  test("UI-configured path shows advanced SSL negotiation options", async ({
    page,
  }) => {
    await openSetupMethod(page, "ui_configured", "Querylane internal storage");
    await page
      .getByRole("button", { name: ADVANCED_CONNECTION_OPTIONS_RE })
      .click();
    await expect(
      page.getByRole("combobox", { name: "SSL negotiation" })
    ).toBeVisible();
    await expect(onboardingPanel(page)).toHaveScreenshot(
      "onboarding-ui-configured-advanced-ssl.png"
    );
  });

  test("manual YAML path shows copyable configuration", async ({ page }) => {
    await openSetupMethod(page, "manual_yaml", "YAML Configuration");
    await expect(page.getByTestId("manual-yaml-config-preview")).toContainText(
      "database:"
    );
    await expect(onboardingPanel(page)).toHaveScreenshot(
      "onboarding-yaml-configuration.png"
    );
  });
});

async function openCreateInstance(page: Page) {
  await mockReadyEmptyApp(page);
  await page.goto("/new-instance");
  await expect(
    page.getByRole("heading", { name: "Postgres server to manage" })
  ).toBeVisible();
}

function createInstanceForm(page: Page) {
  return page.getByTestId("create-instance-page");
}

test.describe("create instance form", () => {
  test("DSN-prefilled advanced fields stay readable", async ({ page }) => {
    await openCreateInstance(page);
    await page.getByLabel("Display name").fill("Production analytics writer");
    await page
      .getByLabel("Connection string")
      .fill(
        "postgres://reporter:secret@analytics-writer.internal.querylane.test:6543/warehouse?sslmode=verify-full"
      );
    await page.getByRole("button", { name: "Apply DSN" }).click();
    await expect(page.getByLabel("Host")).toHaveValue(
      "analytics-writer.internal.querylane.test"
    );
    await page.getByRole("button", { name: "Show advanced options" }).click();
    await page.getByRole("button", { name: "Add label" }).click();
    await page.getByPlaceholder("Key").fill("environment");
    await page.getByPlaceholder("Value").fill("production");
    await expect(createInstanceForm(page)).toHaveScreenshot(
      "create-instance-dsn-advanced.png"
    );
  });
});
