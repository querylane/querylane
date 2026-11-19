import type { Page } from "playwright/test";
import { mockRpc } from "./msw-network.test-utils";
import {
  mockApiManagedConsoleConfig,
  mockEmptyInstanceCatalog,
} from "./querylane-rpc.fixture";

const onboardingRequiredState = {
  appDatabaseStatus: { state: "STATE_NOT_CONFIGURED" },
  availableMethods: [
    "SETUP_METHOD_UI_CONFIGURED",
    "SETUP_METHOD_MANUAL_YAML",
    "SETUP_METHOD_EMBEDDED",
  ],
  configFilePath: "/tmp/querylane/config.yaml",
  embeddedDataPath: "/tmp/querylane/embedded-postgres",
  homePath: "/tmp/querylane",
  isConfigured: false,
  isHomeWritable: true,
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
