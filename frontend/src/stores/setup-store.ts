import { createClient } from "@connectrpc/connect";
import { create, type StateCreator } from "zustand";

import { captureException, logger } from "@/lib/diagnostics";
import { transport } from "@/lib/transport";
import { normalizeAppUiError, reportAppUiError } from "@/lib/ui-error";
import type { AppUiError } from "@/lib/ui-error-types";
import { AppDatabaseStatus_State } from "@/protogen/querylane/console/v1alpha1/console_pb";
import {
  type GetOnboardingStateResponse,
  OnboardingService,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import { registerSetupRequiredHandler } from "@/stores/setup-required-signal";
import {
  type RoutingWarningCode,
  resolveRoutingDecision,
} from "@/stores/setup-routing";

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
  warningCode: RoutingWarningCode | null;
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

function warnIfNeeded(warningCode: RoutingWarningCode | null) {
  if (!warningCode) {
    return;
  }

  logger.warn("Inconsistent onboarding routing state", {
    area: "setup-store",
    warningCode,
  });
}

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
  const dbState =
    response.appDatabaseStatus?.state ?? AppDatabaseStatus_State.UNSPECIFIED;
  const decision = resolveRoutingDecision(response.isConfigured, dbState);

  warnIfNeeded(decision.warningCode);

  set({
    bootError: null,
    onboardingState: response,
    showDegradedBanner: decision.showDegradedBanner,
    showWizardErrorBanner: decision.showWizardErrorBanner,
    status: decision.routeTarget === "ready" ? "ready" : "onboarding",
    warningCode: decision.warningCode,
  });
}

function createRefreshOnboardingStateAction(
  dependencies: SetupStoreDependencies,
  set: SetupStoreSet,
  requestSequence: { current: number }
): SetupState["refreshOnboardingState"] {
  return async () => {
    const requestId = ++requestSequence.current;
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

    const requestId = ++requestSequence.current;
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
      warningCode: null,
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
    warningCode: null,
  }));
}

const setupStore = createSetupStore();
registerSetupRequiredHandler(() => setupStore.getState().setSetupRequired());

export type { SetupStatus, SetupStoreDependencies };
export { createSetupStore, setupStore as useSetupStore };
