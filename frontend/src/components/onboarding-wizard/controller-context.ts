import { createContext } from "react";

import type { OnboardingWizardController } from "@/components/onboarding-wizard/hooks/use-onboarding-wizard-controller";

const OnboardingWizardControllerContext =
  createContext<OnboardingWizardController | null>(null);

export { OnboardingWizardControllerContext };
