import { OnboardingWizardControllerContext } from "@/components/onboarding-wizard/controller-context";
import type { OnboardingWizardController } from "@/components/onboarding-wizard/hooks/use-onboarding-wizard-controller";

function OnboardingWizardControllerProvider({
  children,
  controller,
}: {
  children: React.ReactNode;
  controller: OnboardingWizardController;
}) {
  return (
    <OnboardingWizardControllerContext.Provider value={controller}>
      {children}
    </OnboardingWizardControllerContext.Provider>
  );
}

export { OnboardingWizardControllerProvider };
