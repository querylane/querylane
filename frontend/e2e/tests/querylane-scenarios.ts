import type { Page } from "playwright/test";
import {
  mockApiManagedConsoleConfig,
  mockEmptyInstanceCatalog,
  mockRpc,
  mockRpcError,
} from "./helpers";

const onboardingRequiredState = {
  availableMethods: [
    "SETUP_METHOD_UI_CONFIGURED",
    "SETUP_METHOD_MANUAL_YAML",
    "SETUP_METHOD_EMBEDDED",
  ],
  configFilePath: "/tmp/querylane/config.yaml",
  embeddedDataPath: "/tmp/querylane/embedded-postgres",
  homePath: "/tmp/querylane",
  isHomeWritable: true,
  state: "ONBOARDING_STATE_BOOTSTRAP",
};

const onboardingReadyState = {
  availableMethods: [],
  configFilePath: "/tmp/querylane/config.yaml",
  homePath: "/tmp/querylane",
  isHomeWritable: true,
  state: "ONBOARDING_STATE_READY",
};

const onboardingNoMethodsState = {
  ...onboardingRequiredState,
  availableMethods: [],
};

export async function mockOnboardingRequiredScenario(page: Page) {
  await mockRpc(
    page,
    "OnboardingService/GetOnboardingState",
    onboardingRequiredState
  );
  await mockApiManagedConsoleConfig(page);
  await mockEmptyInstanceCatalog(page);
}

export async function mockOnboardingUnavailableScenario(page: Page) {
  await mockRpcError(
    page,
    "OnboardingService/GetOnboardingState",
    "Meta database is unavailable"
  );
  await mockApiManagedConsoleConfig(page);
  await mockEmptyInstanceCatalog(page);
}

export async function mockOnboardingReadyScenario(page: Page) {
  await mockRpc(
    page,
    "OnboardingService/GetOnboardingState",
    onboardingReadyState
  );
  await mockApiManagedConsoleConfig(page);
  await mockEmptyInstanceCatalog(page);
}

export async function mockOnboardingNoMethodsScenario(page: Page) {
  await mockRpc(
    page,
    "OnboardingService/GetOnboardingState",
    onboardingNoMethodsState
  );
  await mockApiManagedConsoleConfig(page);
  await mockEmptyInstanceCatalog(page);
}

export { onboardingRequiredState };
