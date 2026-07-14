import { createClient } from "@connectrpc/connect";
import { create, type StateCreator } from "zustand";

import { captureException } from "@/lib/diagnostics";
import { transport } from "@/lib/transport";
import { normalizeAppUiError, reportAppUiError } from "@/lib/ui-error";
import type { AppUiError } from "@/lib/ui-error-types";
import {
  type GetOnboardingStateResponse,
  OnboardingService,
  OnboardingState,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import { registerSetupRequiredHandler } from "@/stores/setup-required-signal";

type SetupStatus =
  | "booting"
  | "boot_error"
  | "onboarding"
  | "verifying"
  | "ready";

interface SetupState {
  bootError: AppUiError | null;
  bootstrap: () => Promise<void>;
  onboardingState: GetOnboardingStateResponse | null;
  refreshOnboardingState: () => Promise<void>;
  setSetupRequired: () => void;
  showDegradedBanner: boolean;
  showWizardErrorBanner: boolean;
  status: SetupStatus;
  verifyAfterSetup: () => Promise<void>;
}

interface SetupStoreDependencies {
  onboardingClient: {
    getOnboardingState: (
      request: Record<string, never>
    ) => Promise<GetOnboardingStateResponse>;
  };
}

const defaultDependencies: SetupStoreDependencies = {
  onboardingClient: createClient(OnboardingService, transport),
};

type SetupStoreCreator = StateCreator<SetupState>;
type SetupStoreSet = Parameters<SetupStoreCreator>[0];
type SetupStoreGet = Parameters<SetupStoreCreator>[1];

function createBootError(
  error: unknown,
  context: {
    action: string;
    source: "boot" | "setup";
  }
) {
  const uiError = normalizeAppUiError(error, {
    action: context.action,
    area: "setup-store",
    source: context.source,
  });
  reportAppUiError(uiError);
  return uiError;
}

function setBootError(
  set: SetupStoreSet,
  error: unknown,
  context: {
    action: string;
    source: "boot" | "setup";
  }
) {
  set({
    bootError: createBootError(error, context),
    status: "boot_error",
  });
}

function applyOnboardingState(
  set: SetupStoreSet,
  response: GetOnboardingStateResponse
) {
  let showDegradedBanner = false;
  let showWizardErrorBanner = false;
  let status: SetupStatus;

  switch (response.state) {
    case OnboardingState.BOOTSTRAP:
      showWizardErrorBanner = response.error !== "";
      status = "onboarding";
      break;
    case OnboardingState.DEGRADED:
      showDegradedBanner = true;
      status = "ready";
      break;
    case OnboardingState.READY:
      status = "ready";
      break;
    case OnboardingState.UNSPECIFIED:
      throw new Error("Onboarding state is unspecified");
    default: {
      const unknownState: never = response.state;
      throw new Error(`Unknown onboarding state: ${unknownState}`);
    }
  }

  set({
    bootError: null,
    onboardingState: response,
    showDegradedBanner,
    showWizardErrorBanner,
    status,
  });
}

function createRefreshOnboardingStateAction(
  dependencies: SetupStoreDependencies,
  set: SetupStoreSet,
  requestSequence: { current: number }
): SetupState["refreshOnboardingState"] {
  return async () => {
    requestSequence.current += 1;
    const requestId = requestSequence.current;
    try {
      const response = await dependencies.onboardingClient.getOnboardingState(
        {}
      );
      if (requestId !== requestSequence.current) {
        return;
      }
      applyOnboardingState(set, response);
    } catch (error) {
      if (requestId !== requestSequence.current) {
        return;
      }
      setBootError(set, error, {
        action: "refreshOnboardingState",
        source: "boot",
      });
    }
  };
}

function createBootstrapAction(
  set: SetupStoreSet,
  get: SetupStoreGet
): SetupState["bootstrap"] {
  return async () => {
    set({
      bootError: null,
      status: "booting",
    });

    await get().refreshOnboardingState();
  };
}

function createVerifyAfterSetupAction(
  dependencies: SetupStoreDependencies,
  set: SetupStoreSet,
  requestSequence: { current: number }
): SetupState["verifyAfterSetup"] {
  return async () => {
    set({
      bootError: null,
      status: "verifying",
    });

    requestSequence.current += 1;
    const requestId = requestSequence.current;
    try {
      const response = await dependencies.onboardingClient.getOnboardingState(
        {}
      );
      if (requestId !== requestSequence.current) {
        return;
      }
      applyOnboardingState(set, response);
    } catch (error) {
      if (requestId !== requestSequence.current) {
        return;
      }
      setBootError(set, error, {
        action: "verifyAfterSetup",
        source: "setup",
      });
    }
  };
}

function createSetSetupRequiredAction(
  set: SetupStoreSet,
  get: SetupStoreGet
): SetupState["setSetupRequired"] {
  return () => {
    set({
      bootError: null,
      onboardingState: null,
      showWizardErrorBanner: false,
      status: "onboarding",
    });

    get()
      .refreshOnboardingState()
      .catch((error) => captureException(error));
  };
}

function createSetupStore(
  dependencies: SetupStoreDependencies = defaultDependencies
) {
  const requestSequence = { current: 0 };

  return create<SetupState>()((set, get) => ({
    bootError: null,
    bootstrap: createBootstrapAction(set, get),
    onboardingState: null,
    refreshOnboardingState: createRefreshOnboardingStateAction(
      dependencies,
      set,
      requestSequence
    ),
    setSetupRequired: createSetSetupRequiredAction(set, get),
    showDegradedBanner: false,
    showWizardErrorBanner: false,
    status: "booting",
    verifyAfterSetup: createVerifyAfterSetupAction(
      dependencies,
      set,
      requestSequence
    ),
  }));
}

const setupStore = createSetupStore();
registerSetupRequiredHandler(() => setupStore.getState().setSetupRequired());

export type { SetupStatus, SetupStoreDependencies };
export { createSetupStore, setupStore as useSetupStore };
