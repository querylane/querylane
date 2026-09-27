import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import {
  FeedbackFormRecoveryScenario,
  FeedbackSectionStatesScenario,
} from "@/visual-harness/feedback-scenarios";

// Pixels for these surfaces live in e2e/visual/feedback-states.spec.ts.

test("feedback states cover loading, refreshing, empty, and config-managed guidance", async () => {
  await render(
    <ScreenshotFrame>
      <FeedbackSectionStatesScenario />
    </ScreenshotFrame>
  );

  await expect
    .element(page.getByText("Loading schema metadata…"))
    .toBeVisible();
  await expect
    .element(page.getByText("Refreshing table statistics…"))
    .toBeVisible();
  await expect
    .element(page.getByText("Managed via configuration file"))
    .toBeVisible();
});

test("form recovery states cover password reveal, retry, and destructive actions", async () => {
  await render(
    <ScreenshotFrame>
      <FeedbackFormRecoveryScenario />
    </ScreenshotFrame>
  );

  await expect
    .element(page.getByLabel("Password", { exact: true }))
    .toBeVisible();
  await expect.element(page.getByText("Danger zone")).toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Loading Querylane" }))
    .toBeVisible();
});
