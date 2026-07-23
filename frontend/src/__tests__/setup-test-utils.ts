import { vi } from "vitest";
import type { SetupContextValue } from "@/components/setup-context";

function createSetupContextValue(
  overrides: Partial<SetupContextValue> = {}
): SetupContextValue {
  return {
    bootError: null,
    onboardingState: null,
    refreshOnboardingState: vi.fn(async () => undefined),
    showDegradedBanner: false,
    showWizardErrorBanner: false,
    status: "ready",
    verifyAfterSetup: vi.fn(async () => undefined),
    warningCode: null,
    ...overrides,
  };
}

export { createSetupContextValue };
