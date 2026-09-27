import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { beforeEach, describe, expect, rs, test } from "@rstest/core";
import { screen } from "@testing-library/dom";
import {
  OnboardingBrowserHarness,
  ScreenshotFrame,
} from "@/__tests__/browser-test-utils";
import type { ConfigMethod } from "@/components/onboarding-wizard/types";
import { OnboardingWizardContent } from "@/components/onboarding-wizard/wizard-content";
import { useOnboardingWizardStore } from "@/stores/onboarding-wizard-store";
import { useSetupStore } from "@/stores/setup-store";
import {
  onboardingState,
  STORAGE_FULL_ERROR_MESSAGE,
} from "@/visual-harness/onboarding-scenario-data";
import {
  OnboardingProgressFailedScenario,
  OnboardingProgressRunningScenario,
  OnboardingProgressSuccessScenario,
  OnboardingStorageFullScenario,
  OnboardingYamlWaitingScenario,
} from "@/visual-harness/onboarding-scenarios";

// Pixels for every wizard phase live in e2e/visual/onboarding.spec.ts.

const ADVANCED_CONNECTION_OPTIONS_RE = /Advanced connection options/;
const INVALID_CONNECTION_STRING_RE = /Invalid connection string/;
const TOOLTIP_TRIGGER_SELECTOR = "[data-base-ui-tooltip-trigger]";

rs.mock("@/hooks/api/instance", () => ({
  useTestInstanceConnectionMutation: () => ({
    mutateAsync: rs.fn(async () => undefined),
  }),
}));

async function renderWizard() {
  await render(
    <OnboardingBrowserHarness>
      <OnboardingWizardContent />
    </OnboardingBrowserHarness>
  );
}

function getConfigurePhase(method: ConfigMethod) {
  if (method === "ui_configured") {
    return "configure_ui";
  }
  if (method === "manual_yaml") {
    return "configure_yaml";
  }
  return "configure_embedded";
}

async function openConfigurePhase(method: ConfigMethod) {
  useOnboardingWizardStore.setState({
    phase: getConfigurePhase(method),
    selectedMethod: method,
  });
  await renderWizard();
}

beforeEach(() => {
  useSetupStore.setState({
    bootError: null,
    onboardingState: onboardingState(),
    showDegradedBanner: false,
    showWizardErrorBanner: false,
    status: "onboarding",
    warningCode: null,
  });
  useOnboardingWizardStore.getState().resetSession();
});

describe("Onboarding wizard — browser behavior", () => {
  test("method selection presents all available ways to get started", async () => {
    await renderWizard();

    await expect
      .element(
        page.getByRole("heading", {
          name: "How would you like to get started?",
        })
      )
      .toBeVisible();
    await expect.element(page.getByText("Configure via UI")).toBeVisible();
    await expect
      .element(page.getByText("Configure YAML manually"))
      .toBeVisible();
    await expect.element(page.getByText("Use embedded database")).toBeVisible();
    await expect.element(page.getByTestId("onboarding-panel")).toBeVisible();
  });

  test("UI-configured path renders the default connection fields", async () => {
    await openConfigurePhase("ui_configured");

    await expect
      .element(
        page.getByRole("heading", { name: "Querylane internal storage" })
      )
      .toBeVisible();
    await expect.element(page.getByLabel("Host")).toHaveValue("localhost");
    await expect.element(page.getByLabel("Database")).toHaveValue("querylane");
  });

  test("UI-configured path renders advanced SSL negotiation options", async () => {
    await openConfigurePhase("ui_configured");

    await page
      .getByRole("button", { name: ADVANCED_CONNECTION_OPTIONS_RE })
      .click();

    await expect
      .element(page.getByRole("combobox", { name: "SSL negotiation" }))
      .toBeVisible();
  });

  test("UI-configured path requires a successful connection test before continuing", async () => {
    await openConfigurePhase("ui_configured");

    await page.getByRole("textbox", { name: "Password" }).fill("secret");

    const continueButton = page.getByRole("button", { name: "Continue" });
    await expect.element(continueButton).toBeDisabled();
    await page
      .locator(TOOLTIP_TRIGGER_SELECTOR)
      .filter({ has: continueButton })
      .hover();
    await expect
      .element(page.getByText("Test this connection before continuing.").last())
      .toBeVisible();

    await page.getByRole("button", { name: "Test connection" }).click();

    await expect.element(continueButton).toBeEnabled();

    await page.getByLabel("Host").fill("db.internal");

    await expect.element(continueButton).toBeDisabled();
  });

  test("UI-configured path applies a pasted connection string", async () => {
    await openConfigurePhase("ui_configured");

    await page.getByRole("tab", { name: "Connection string" }).click();
    await page
      .getByLabel("PostgreSQL connection string")
      .fill("not-a-connection-string");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect
      .element(page.getByText(INVALID_CONNECTION_STRING_RE))
      .toBeVisible();

    await page
      .getByLabel("PostgreSQL connection string")
      .fill(
        "postgres://admin:secret@db.internal:6432/querylane?sslmode=require"
      );
    await page.getByRole("button", { name: "Apply" }).click();

    await expect.element(page.getByLabel("Host")).toHaveValue("db.internal");
    await expect.element(page.getByLabel("Port")).toHaveValue("6432");
  });

  test("UI-configured path warns about DSN parameters it cannot apply", async () => {
    await openConfigurePhase("ui_configured");

    await page.getByRole("tab", { name: "Connection string" }).click();
    await page
      .getByLabel("PostgreSQL connection string")
      .fill(
        "postgres://admin:secret@db.internal/querylane?sslmode=require&options=project%3Dquerylane"
      );
    await page.getByRole("button", { name: "Apply" }).click();

    await expect
      .element(page.getByRole("status"))
      .toContainText("DSN parameters not applied: options.");
    expect(
      screen.getByRole("status").getBoundingClientRect().bottom
    ).toBeLessThanOrEqual(window.innerHeight);

    await page.getByRole("tab", { name: "Connection string" }).click();
    await expect
      .element(page.getByRole("status"))
      .toContainText("DSN parameters not applied: options.");
  });

  test("manual YAML path shows copyable configuration", async () => {
    await openConfigurePhase("manual_yaml");

    await expect
      .element(page.getByRole("heading", { name: "YAML Configuration" }))
      .toBeVisible();
    await expect
      .element(page.getByText("/Users/you/.querylane/config.yaml").first())
      .toBeVisible();
  });

  test("manual YAML path shows the waiting-for-config state", async () => {
    await render(
      <ScreenshotFrame>
        <OnboardingYamlWaitingScenario />
      </ScreenshotFrame>
    );

    await expect
      .element(page.getByRole("heading", { name: "Waiting for configuration" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "I've saved the file" }))
      .toBeVisible();
  });

  test("embedded path shows persistent storage details with automatic port", async () => {
    await openConfigurePhase("embedded");

    await expect
      .element(page.getByRole("heading", { name: "Embedded PostgreSQL" }))
      .toBeVisible();
    await expect
      .element(page.getByText("Persistent: data is kept across restarts"))
      .toBeVisible();
    await expect
      .element(page.getByText("/Users/you/.querylane/pgdata"))
      .toBeVisible();
    await expect
      .element(page.getByText("Local port, chosen automatically"))
      .toBeVisible();
  });

  test("running progress explains which setup step is active", async () => {
    await render(
      <ScreenshotFrame>
        <OnboardingProgressRunningScenario />
      </ScreenshotFrame>
    );

    await expect
      .element(page.getByRole("heading", { name: "Setting up Querylane" }))
      .toBeVisible();
    await expect
      .element(page.getByText("Apply migrations").first())
      .toBeVisible();
  });

  test("failed progress highlights likely configuration errors", async () => {
    await render(
      <ScreenshotFrame>
        <OnboardingProgressFailedScenario />
      </ScreenshotFrame>
    );

    await expect
      .element(page.getByRole("heading", { name: "Setup failed" }))
      .toBeVisible();
    await expect
      .element(page.getByText("Likely a configuration issue"))
      .toBeVisible();
  });

  test("embedded storage exhaustion shows only applicable recovery actions", async () => {
    await render(
      <ScreenshotFrame>
        <OnboardingStorageFullScenario />
      </ScreenshotFrame>
    );

    await expect.element(page.getByText("Storage full")).toBeVisible();
    await expect
      .element(
        page.getByText(
          "Free disk space where Querylane stores embedded PostgreSQL data, then retry."
        )
      )
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Retry" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Reconfigure" }))
      .toHaveCount(0);
    await expect
      .element(page.getByRole("link", { name: "Report bug" }))
      .toHaveCount(0);
    expect(screen.queryByText(STORAGE_FULL_ERROR_MESSAGE)).toBeNull();
  });

  test("successful progress gives a clear finish state", async () => {
    await render(
      <ScreenshotFrame>
        <OnboardingProgressSuccessScenario />
      </ScreenshotFrame>
    );

    await expect
      .element(page.getByRole("heading", { name: "You're all set!" }))
      .toBeVisible();
    await expect.element(page.getByText("Ready to go!")).toBeVisible();
  });
});
