"use client";

import { OnboardingWizardControllerProvider } from "@/components/onboarding-wizard/controller-provider";
import { useOnboardingWizardController } from "@/components/onboarding-wizard/hooks/use-onboarding-wizard-controller";
import { OnboardingWizardStateProvider } from "@/components/onboarding-wizard/onboarding-wizard-state-provider";
import type { OnboardingWizardProps } from "@/components/onboarding-wizard/types";
import { OnboardingWizardContent } from "@/components/onboarding-wizard/wizard-content";

function OnboardingWizard({ onFinish, open = true }: OnboardingWizardProps) {
  if (!open) {
    return null;
  }

  return (
    <OnboardingWizardStateProvider>
      <OnboardingWizardMounted onFinish={onFinish} />
    </OnboardingWizardStateProvider>
  );
}

function OnboardingWizardMounted({
  onFinish,
}: Pick<OnboardingWizardProps, "onFinish">) {
  const controller = useOnboardingWizardController({ onFinish });

  return (
    <OnboardingWizardControllerProvider controller={controller}>
      <OnboardingWizardContent />
    </OnboardingWizardControllerProvider>
  );
}

export { OnboardingWizard };
