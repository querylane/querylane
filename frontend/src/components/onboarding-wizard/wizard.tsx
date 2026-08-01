"use client";

import { OnboardingWizardControllerProvider } from "@/components/onboarding-wizard/controller-provider";
import { useOnboardingWizardController } from "@/components/onboarding-wizard/hooks/use-onboarding-wizard-controller";
import type { OnboardingWizardProps } from "@/components/onboarding-wizard/types";
import { OnboardingWizardContent } from "@/components/onboarding-wizard/wizard-content";

function OnboardingWizard({
  initialMethod,
  onFinish,
  open = true,
}: OnboardingWizardProps) {
  if (!open) {
    return null;
  }

  return (
    <OnboardingWizardMounted
      initialMethod={initialMethod}
      onFinish={onFinish}
    />
  );
}

function OnboardingWizardMounted({
  initialMethod,
  onFinish,
}: Pick<OnboardingWizardProps, "initialMethod" | "onFinish">) {
  const controller = useOnboardingWizardController({ initialMethod, onFinish });

  return (
    <OnboardingWizardControllerProvider controller={controller}>
      <OnboardingWizardContent />
    </OnboardingWizardControllerProvider>
  );
}

export { OnboardingWizard };
