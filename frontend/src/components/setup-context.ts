import { createContext, use } from "react";
import type { AppUiError } from "@/lib/ui-error-types";
import type { GetOnboardingStateResponse } from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import type { RoutingWarningCode } from "@/stores/setup-routing";

type SetupStatus =
  | "booting"
  | "boot_error"
  | "onboarding"
  | "verifying"
  | "ready";

interface SetupContextValue {
  bootError: AppUiError | null;
  onboardingState: GetOnboardingStateResponse | null;
  refreshOnboardingState: () => Promise<void>;
  showDegradedBanner: boolean;
  showWizardErrorBanner: boolean;
  status: SetupStatus;
  verifyAfterSetup: () => Promise<void>;
  warningCode: RoutingWarningCode | null;
}

const SetupContext = createContext<SetupContextValue | null>(null);

function useSetup() {
  const context = use(SetupContext);
  if (!context) {
    throw new Error("useSetup must be used within SetupProvider");
  }
  return context;
}

export type { SetupContextValue, SetupStatus };
export { SetupContext, useSetup };
