import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import {
  useOnboardingWizardActions,
  useOnboardingWizardState,
} from "@/components/onboarding-wizard/onboarding-wizard-state-context";
import { OnboardingWizardStateProvider } from "@/components/onboarding-wizard/onboarding-wizard-state-provider";
import { Button } from "@/components/ui/button";

function WizardStateHarness() {
  const { phase, selectedMethod } = useOnboardingWizardState();
  const { selectMethod, startProgress } = useOnboardingWizardActions();

  return (
    <>
      <p>
        {phase}:{selectedMethod ?? "none"}
      </p>
      <Button onClick={() => selectMethod("manual_yaml")}>Select YAML</Button>
      <Button onClick={startProgress}>Start progress</Button>
    </>
  );
}

function renderWizardState() {
  return render(
    <OnboardingWizardStateProvider>
      <WizardStateHarness />
    </OnboardingWizardStateProvider>
  );
}

afterEach(cleanup);

describe("OnboardingWizardStateProvider", () => {
  test("scopes wizard progress to one mounted wizard", async () => {
    const user = userEvent.setup();
    const firstRender = renderWizardState();

    await user.click(screen.getByRole("button", { name: "Select YAML" }));
    await user.click(screen.getByRole("button", { name: "Start progress" }));
    expect(
      screen.getByText("progress_waiting_for_config:manual_yaml")
    ).toBeTruthy();

    firstRender.unmount();
    renderWizardState();

    expect(screen.getByText("method_selection:none")).toBeTruthy();
  });
});
