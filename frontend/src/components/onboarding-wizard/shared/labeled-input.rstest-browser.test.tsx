import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { OnboardingInvalidFieldsScenario } from "@/visual-harness/onboarding-scenarios";

// Pixels for each focus state live in e2e/visual/onboarding.spec.ts.

function validationBorderColor() {
  const swatch = document.querySelector('[data-testid="validation-color"]');
  if (!(swatch instanceof HTMLElement)) {
    throw new Error("Expected the validation color swatch.");
  }
  return getComputedStyle(swatch).borderColor;
}

test("invalid onboarding fields preserve validation styling through keyboard focus", async () => {
  await render(
    <ScreenshotFrame>
      <OnboardingInvalidFieldsScenario />
    </ScreenshotFrame>
  );
  const host = page.getByLabel("Host");
  const password = page.getByLabel("Password", { exact: true });
  const expectedBorder = validationBorderColor();

  await expect.element(host).toHaveCSS("border-color", expectedBorder);
  await expect.element(password).toHaveCSS("border-color", expectedBorder);

  await host.focus();
  await expect.element(host).toBeFocused();
  await expect.element(host).toHaveCSS("border-color", expectedBorder);

  await host.press("Tab");
  await expect.element(password).toBeFocused();
  await expect.element(password).toHaveCSS("border-color", expectedBorder);
});
