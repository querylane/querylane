import { useId } from "react";
import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { LabeledInput } from "./labeled-input";

afterEach(async () => {
  await cleanup();
});

function InvalidOnboardingFields() {
  const hostId = useId();
  const passwordId = useId();
  return (
    <ScreenshotFrame>
      <div
        aria-hidden="true"
        className="hidden border-destructive dark:border-destructive/50"
        data-testid="validation-color"
      />
      <div
        className="w-96 bg-onboarding-backdrop p-6"
        data-testid="invalid-fields"
      >
        <LabeledInput
          defaultValue="localhost"
          error="Enter a valid host"
          id={hostId}
          label="Host"
        />
        <LabeledInput
          defaultValue="secret"
          error="Enter a password"
          id={passwordId}
          label="Password"
          type="password"
        />
      </div>
    </ScreenshotFrame>
  );
}

test("invalid onboarding fields preserve validation styling through keyboard focus", async () => {
  await render(<InvalidOnboardingFields />);
  const fields = page.getByTestId("invalid-fields");
  const host = page.getByLabelText("Host");
  const password = page.getByLabelText("Password", { exact: true });
  const expectedBorder = getComputedStyle(
    page.getByTestId("validation-color").element()
  ).borderColor;

  expect(getComputedStyle(host.element()).borderColor).toBe(expectedBorder);
  expect(getComputedStyle(password.element()).borderColor).toBe(expectedBorder);
  await expect(fields).toMatchScreenshot("invalid-onboarding-fields");

  const user = userEvent.setup();
  await user.tab();
  await expect.element(host).toHaveFocus();
  expect(getComputedStyle(host.element()).borderColor).toBe(expectedBorder);
  await expect(fields).toMatchScreenshot("invalid-onboarding-host-focus");

  await user.tab();
  await expect.element(password).toHaveFocus();
  expect(getComputedStyle(password.element()).borderColor).toBe(expectedBorder);
  await expect(fields).toMatchScreenshot("invalid-onboarding-password-focus");
});
