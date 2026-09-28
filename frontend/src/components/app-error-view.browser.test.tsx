import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { POSTGRES_ERROR_EXAMPLES } from "@/visual-harness/feedback-scenario-data";
import {
  PostgresErrorDetailsScenario,
  PostgresErrorSummariesScenario,
} from "@/visual-harness/feedback-scenarios";

// Pixels for these surfaces live in e2e/visual/feedback-states.spec.ts.

test("common PostgreSQL errors keep concise guidance on the main surface", async () => {
  await render(
    <ScreenshotFrame>
      <PostgresErrorSummariesScenario />
    </ScreenshotFrame>
  );

  await Promise.all(
    POSTGRES_ERROR_EXAMPLES.map((example) =>
      expect
        .element(
          page.getByText(
            `PostgreSQL ${example.conditionName} during ${example.operation}`
          )
        )
        .toBeVisible()
    )
  );
});

test("PostgreSQL error details expose diagnostics and support actions", async () => {
  await render(
    <ScreenshotFrame>
      <PostgresErrorDetailsScenario />
    </ScreenshotFrame>
  );

  await page.getByRole("button", { name: "Error details" }).click();

  const dialog = page.getByRole("dialog", {
    name: "PostgreSQL permission denied",
  });
  await expect.element(dialog).toBeVisible();
  await expect
    .element(page.getByText("SQLSTATE: 42501", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      page.getByText("Condition: insufficient_privilege", { exact: true })
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Copy details" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Copy as cURL" }))
    .not.toBeAttached();
  await expect
    .element(page.getByRole("button", { name: "Download" }))
    .not.toBeAttached();
});
