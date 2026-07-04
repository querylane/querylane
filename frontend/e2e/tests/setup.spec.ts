import { expect, test } from "./base";
import {
  mockOnboardingReadyScenario,
  mockOnboardingRequiredScenario,
  mockOnboardingUnavailableScenario,
} from "./querylane-scenarios";

const CONFIGURE_VIA_UI_RE = /Configure via UI/;
const CONFIGURE_YAML_MANUALLY_RE = /Configure YAML manually/;
const NEW_INSTANCE_URL_RE = /\/new-instance$/;

test("onboarding entrypoint renders setup choices from mocked RPC state", {
  tag: ["@smoke", "@feat:onboarding", "@flow:create"],
}, async ({ page }) => {
  await mockOnboardingRequiredScenario(page);
  await page.goto("/setup");

  await expect(
    page.getByRole("heading", { name: "How would you like to get started?" })
  ).toBeVisible();
  await expect(page.getByText("Configure via UI")).toBeVisible();
  await expect(page.getByText("Configure YAML manually")).toBeVisible();
});

test("onboarding entrypoint wraps setup method copy inside cards", {
  tag: ["@feat:onboarding", "@flow:query"],
}, async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 390 });
  await mockOnboardingRequiredScenario(page);
  await page.goto("/setup");

  await expect(
    page.getByRole("heading", { name: "How would you like to get started?" })
  ).toBeVisible();

  const overflowingCards = await page
    .locator("[data-setup-method-card]")
    .evaluateAll(
      (cards) =>
        cards.filter((card) => card.scrollWidth > card.clientWidth + 1).length
    );

  expect(overflowingCards).toBe(0);
});

test("onboarding boot error renders retryable error state from mocked RPC failure", {
  tag: ["@feat:onboarding", "@flow:error"],
}, async ({ page }) => {
  await mockOnboardingUnavailableScenario(page);
  await page.goto("/setup");

  await expect(page.getByText("Unexpected error")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("onboarding entrypoint has no serious accessibility violations", {
  tag: ["@feat:onboarding", "@a11y"],
}, async ({ makeAxeBuilder, page }) => {
  await mockOnboardingRequiredScenario(page);
  await page.goto("/setup");
  await expect(
    page.getByRole("heading", { name: "How would you like to get started?" })
  ).toBeVisible();

  const results = await makeAxeBuilder().analyze();
  const seriousViolations = results.violations.filter((violation) =>
    ["critical", "serious"].includes(violation.impact ?? "")
  );

  expect(seriousViolations).toEqual([]);
});

test("onboarding UI setup choice opens internal storage form and can go back", {
  tag: ["@feat:onboarding", "@flow:create"],
}, async ({ page }) => {
  await mockOnboardingRequiredScenario(page);
  await page.goto("/setup");

  await page.getByRole("radio", { name: CONFIGURE_VIA_UI_RE }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "Querylane internal storage" })
  ).toBeVisible();
  await expect(page.getByLabel("Host")).toHaveValue("localhost");
  await expect(page.getByLabel("Database")).toHaveValue("querylane");

  await page.getByRole("button", { name: "Back" }).click();
  await expect(
    page.getByRole("heading", { name: "How would you like to get started?" })
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: CONFIGURE_VIA_UI_RE })
  ).toHaveAttribute("aria-checked", "true");
});

test("onboarding manual YAML choice shows guidance and no dead end", {
  tag: ["@feat:onboarding", "@flow:create"],
}, async ({ page }) => {
  await mockOnboardingRequiredScenario(page);
  await page.goto("/setup");

  await page.getByRole("radio", { name: CONFIGURE_YAML_MANUALLY_RE }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "YAML Configuration" })
  ).toBeVisible();
  await expect(
    page.getByText("/tmp/querylane/config.yaml", { exact: true })
  ).toBeVisible();
  await expect(page.getByTestId("manual-yaml-config-preview")).toContainText(
    "database:"
  );
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
});

test("setup state: ready setup redirects empty API catalog to create instance", {
  tag: ["@feat:onboarding", "@flow:navigate"],
}, async ({ page }) => {
  await mockOnboardingReadyScenario(page);

  await page.goto("/setup");

  await expect(page).toHaveURL(NEW_INSTANCE_URL_RE);
  await expect(
    page.getByRole("heading", { name: "Postgres server to manage" })
  ).toBeVisible();
});

test("setup state: unavailable boot error retries into onboarding", {
  tag: ["@feat:onboarding", "@flow:error"],
}, async ({ page }) => {
  await mockOnboardingRequiredScenario(page);
  const failFirstStateRequest = async (
    route: Parameters<Parameters<typeof page.route>[1]>[0]
  ) => {
    await route.fulfill({
      body: JSON.stringify({
        code: "internal",
        message: "Meta database is unavailable",
      }),
      contentType: "application/json",
      status: 500,
    });
  };
  await page.route(
    "**/OnboardingService/GetOnboardingState",
    failFirstStateRequest,
    { times: 1 }
  );
  await page.route(
    "**.OnboardingService/GetOnboardingState",
    failFirstStateRequest,
    { times: 1 }
  );

  await page.goto("/setup");
  await expect(page.getByText("Unexpected error")).toBeVisible();

  await page.getByRole("button", { name: "Retry" }).click();

  await expect(
    page.getByRole("heading", { name: "How would you like to get started?" })
  ).toBeVisible();
});
