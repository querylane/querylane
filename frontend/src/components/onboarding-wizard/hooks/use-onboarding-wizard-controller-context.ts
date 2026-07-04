import { useContext } from "react";

import { OnboardingWizardControllerContext } from "@/components/onboarding-wizard/controller-context";

function useOnboardingWizardControllerContext() {
  const context = useContext(OnboardingWizardControllerContext);
  if (!context) {
    throw new Error(
      "useOnboardingWizardControllerContext must be used within OnboardingWizardControllerProvider"
    );
  }

  return context;
}

export { useOnboardingWizardControllerContext };
