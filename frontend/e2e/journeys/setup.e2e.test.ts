import { expect, test } from "./browser.test-utils";
import { mockRpcError } from "./msw-network.test-utils";
import { mockOnboardingRequiredScenario } from "./onboarding.fixture";

const CONFIGURE_YAML_MANUALLY_RE = /Configure YAML manually/u;

test("recovers a boot failure and opens the manual setup instructions", {
  tag: ["@feat:onboarding", "@flow:error"],
}, async ({ checkAccessibility, page }) => {
  await mockOnboardingRequiredScenario(page);
  await mockRpcError({
    page,
    method: "OnboardingService/GetOnboardingState",
    message: "Meta database is unavailable",
    once: true,
  });

  await page.goto("/setup");
  await expect(
    page.getByRole("heading", { name: "Cannot reach Querylane" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Retry" }).click();

  await expect(
    page.getByRole("heading", { name: "How would you like to get started?" })
  ).toBeVisible();
  await checkAccessibility();

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
