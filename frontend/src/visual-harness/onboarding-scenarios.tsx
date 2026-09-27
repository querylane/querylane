import { useId, useState } from "react";
import { OnboardingWizardControllerProvider } from "@/components/onboarding-wizard/controller-provider";
import { LabeledInput } from "@/components/onboarding-wizard/shared/labeled-input";
import { OnboardingWizardContent } from "@/components/onboarding-wizard/wizard-content";
import { useOnboardingWizardStore } from "@/stores/onboarding-wizard-store";
import { useSetupStore } from "@/stores/setup-store";
import {
  createIdleOnboardingController,
  onboardingState,
  PROGRESS_FAILED_SESSION,
  PROGRESS_RUNNING_SESSION,
  PROGRESS_SUCCESS_SESSION,
  STORAGE_FULL_SESSION,
  type WizardSession,
  YAML_WAITING_SESSION,
} from "@/visual-harness/onboarding-scenario-data";

// Onboarding states shared by rstest behavior tests and the Playwright visual
// harness. Setup progress needs a live server stream, so these seed the wizard
// stores directly instead of driving the /setup route.

function seedWizardSession(session: WizardSession) {
  useSetupStore.setState({
    bootError: null,
    onboardingState: onboardingState(),
    showDegradedBanner: false,
    showWizardErrorBanner: false,
    status: "onboarding",
    warningCode: null,
  });
  useOnboardingWizardStore.getState().resetSession();
  useOnboardingWizardStore.setState(session);
}

function WizardSessionScenario({ session }: { session: WizardSession }) {
  // Seed once, before the first render reads the stores.
  useState(() => {
    seedWizardSession(session);
    return true;
  });
  const [controller] = useState(createIdleOnboardingController);

  return (
    <div className="w-[1232px]">
      <OnboardingWizardControllerProvider controller={controller}>
        <OnboardingWizardContent />
      </OnboardingWizardControllerProvider>
    </div>
  );
}

function OnboardingProgressRunningScenario() {
  return <WizardSessionScenario session={PROGRESS_RUNNING_SESSION} />;
}

function OnboardingProgressFailedScenario() {
  return <WizardSessionScenario session={PROGRESS_FAILED_SESSION} />;
}

function OnboardingProgressSuccessScenario() {
  return <WizardSessionScenario session={PROGRESS_SUCCESS_SESSION} />;
}

function OnboardingStorageFullScenario() {
  return <WizardSessionScenario session={STORAGE_FULL_SESSION} />;
}

function OnboardingYamlWaitingScenario() {
  return <WizardSessionScenario session={YAML_WAITING_SESSION} />;
}

function OnboardingInvalidFieldsScenario() {
  const hostId = useId();
  const passwordId = useId();
  return (
    <>
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
    </>
  );
}

export {
  OnboardingInvalidFieldsScenario,
  OnboardingProgressFailedScenario,
  OnboardingProgressRunningScenario,
  OnboardingProgressSuccessScenario,
  OnboardingStorageFullScenario,
  OnboardingYamlWaitingScenario,
};
