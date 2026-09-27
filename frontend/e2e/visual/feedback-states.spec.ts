import type { Page } from "playwright/test";
import { expect, test } from "../tests/base";
import {
  fulfillJson,
  mockApiManagedConsoleConfig,
  mockEmptyInstanceCatalog,
} from "../tests/helpers";

// Shared feedback, error, and boot states. The boot error runs on the real app
// with a timed-out onboarding RPC; the galleries are isolated scenarios in
// src/visual-harness. Behavior for the same states is covered by the rstest
// browser tests beside each component.

const APP_VERSION_RE = /^Querylane \d/;

async function openScenario(page: Page, scenario: string) {
  await page.goto(`/visual.html?scenario=${scenario}`);
  const frame = page.getByTestId("visual-frame");
  await expect(frame).toBeVisible();
  return frame;
}

async function mockOnboardingStateTimeout(page: Page) {
  const body = { code: "deadline_exceeded", message: "deadline exceeded" };
  await page.route("**/OnboardingService/GetOnboardingState", async (route) => {
    await fulfillJson(route, body, 504);
  });
  await page.route("**.OnboardingService/GetOnboardingState", async (route) => {
    await fulfillJson(route, body, 504);
  });
}

test("boot failure keeps reachability guidance inside the app shell", async ({
  page,
}) => {
  await mockOnboardingStateTimeout(page);
  await mockApiManagedConsoleConfig(page);
  await mockEmptyInstanceCatalog(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Cannot reach Querylane" })
  ).toBeVisible();
  await expect(
    page.getByText(
      "Check that the Querylane server is running and that your network or proxy can reach it, then retry."
    )
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  // The shell header shows the package version, which changes every release.
  await expect(page).toHaveScreenshot("boot-querylane-unreachable.png", {
    mask: [page.getByText(APP_VERSION_RE)],
  });
});

test("section states cover loading, refreshing, empty, and config-managed guidance", async ({
  page,
}) => {
  const frame = await openScenario(page, "feedback-section-states");
  await expect(frame.getByText("Refreshing table statistics…")).toBeVisible();
  await expect(frame).toHaveScreenshot("feedback-loading-refreshing-empty.png");
});

test("form recovery states cover password, retry, and destructive actions", async ({
  page,
}) => {
  const frame = await openScenario(page, "feedback-form-recovery");
  await expect(frame.getByText("Danger zone")).toBeVisible();
  await expect(frame).toHaveScreenshot("feedback-form-recovery-danger.png");
});

test("common PostgreSQL errors keep concise guidance on the main surface", async ({
  page,
}) => {
  const frame = await openScenario(page, "feedback-postgres-error-summaries");
  await expect(
    frame.getByText("PostgreSQL unique_violation during create_user")
  ).toBeVisible();
  await expect(frame).toHaveScreenshot("postgres-error-summaries.png");
});

test("PostgreSQL error details expose diagnostics and support actions", async ({
  page,
}) => {
  const frame = await openScenario(page, "feedback-postgres-error-details");
  await frame.getByRole("button", { name: "Error details" }).click();

  const dialog = page.getByRole("dialog", {
    name: "PostgreSQL permission denied",
  });
  await expect(
    dialog.getByText("SQLSTATE: 42501", { exact: true })
  ).toBeVisible();
  await expect(dialog).toHaveScreenshot("postgres-error-details.png");
});
