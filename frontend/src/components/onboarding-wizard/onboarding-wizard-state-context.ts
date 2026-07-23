import { createContext, use } from "react";
import type {
  OnboardingWizardActions,
  OnboardingWizardState,
} from "@/components/onboarding-wizard/onboarding-wizard-state";

const OnboardingWizardStateContext =
  createContext<OnboardingWizardState | null>(null);
const OnboardingWizardActionsContext =
  createContext<OnboardingWizardActions | null>(null);

function useOnboardingWizardState() {
  const state = use(OnboardingWizardStateContext);
  if (!state) {
    throw new Error(
      "useOnboardingWizardState must be used within OnboardingWizardStateProvider"
    );
  }
  return state;
}

function useOnboardingWizardActions() {
  const actions = use(OnboardingWizardActionsContext);
  if (!actions) {
    throw new Error(
      "useOnboardingWizardActions must be used within OnboardingWizardStateProvider"
    );
  }
  return actions;
}

export {
  OnboardingWizardActionsContext,
  OnboardingWizardStateContext,
  useOnboardingWizardActions,
  useOnboardingWizardState,
};
