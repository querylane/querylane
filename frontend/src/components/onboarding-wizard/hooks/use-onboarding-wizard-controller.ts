import { useEffect } from "react";

import { useSetupExecution } from "@/components/onboarding-wizard/hooks/use-setup-execution";
import { useWizardWatchState } from "@/components/onboarding-wizard/hooks/use-wizard-watch-state";
import type { ConfigMethod } from "@/components/onboarding-wizard/types";
import { useSetupAppDatabaseMutation } from "@/hooks/api/onboarding";
import { formatSetupMethod } from "@/lib/protobuf-enums";
import { useOnboardingWizardStore } from "@/stores/onboarding-wizard-store";
import { useSetupStore } from "@/stores/setup-store";

interface UseOnboardingWizardControllerOptions {
  initialMethod?: ConfigMethod | undefined;
  onFinish?: (() => void) | undefined;
}

interface OnboardingWizardController {
  finishWizard: () => void;
  goBackToConfigure: () => void;
  goBackToMethodSelection: () => void;
  refreshOnboardingState: () => Promise<void>;
  retryWatch: () => Promise<void>;
  setupRunning: boolean;
  watchIsRunning: boolean;
  watchManualRetryRequired: boolean;
  watchRetryPending: boolean;
}

function useWizardSessionState() {
  return {
    applyProgressEvent: useOnboardingWizardStore(
      (state) => state.applyProgressEvent
    ),
    goBackToMethodSelectionStateAction: useOnboardingWizardStore(
      (state) => state.goBackToMethodSelection
    ),
    goToConfigureStateAction: useOnboardingWizardStore(
      (state) => state.goToConfigure
    ),
    markSetupSuccess: useOnboardingWizardStore(
      (state) => state.markSetupSuccess
    ),
    phase: useOnboardingWizardStore((state) => state.phase),
    resetSession: useOnboardingWizardStore((state) => state.resetSession),
    selectedMethod: useOnboardingWizardStore((state) => state.selectedMethod),
    setConfigureValidationError: useOnboardingWizardStore(
      (state) => state.setConfigureValidationError
    ),
    setStreamFailure: useOnboardingWizardStore(
      (state) => state.setStreamFailure
    ),
    setupRunToken: useOnboardingWizardStore((state) => state.setupRunToken),
    setWatchNotice: useOnboardingWizardStore((state) => state.setWatchNotice),
    submittedEmbeddedConfig: useOnboardingWizardStore(
      (state) => state.submittedEmbeddedConfig
    ),
    submittedPostgresConfig: useOnboardingWizardStore(
      (state) => state.submittedPostgresConfig
    ),
  };
}

function getFailedOnboardingEvent() {
  return useOnboardingWizardStore.getState().failedEvent;
}

export function useOnboardingWizardController({
  initialMethod,
  onFinish,
}: UseOnboardingWizardControllerOptions): OnboardingWizardController {
  const {
    applyProgressEvent,
    goToConfigureStateAction,
    goBackToMethodSelectionStateAction,
    markSetupSuccess,
    phase,
    resetSession,
    selectedMethod,
    setupRunToken,
    setConfigureValidationError,
    setStreamFailure,
    setWatchNotice,
    submittedEmbeddedConfig,
    submittedPostgresConfig,
  } = useWizardSessionState();
  const refreshOnboardingState = useSetupStore(
    (state) => state.refreshOnboardingState
  );
  const onboardingState = useSetupStore((state) => state.onboardingState);

  // allow-useEffect: sync wizard phase state
  useEffect(() => {
    resetSession();
    return () => {
      resetSession();
    };
  }, [resetSession]);

  // Deep link (/setup?method=…): skip method selection once the server
  // confirms the requested method is available. Only fires while the wizard
  // is untouched, so going Back never bounces the user forward again.
  useEffect(
    function applyInitialMethod() {
      if (!(initialMethod && onboardingState)) {
        return;
      }
      const store = useOnboardingWizardStore.getState();
      if (store.phase !== "method_selection" || store.selectedMethod !== null) {
        return;
      }
      const isAvailable = onboardingState.availableMethods.some(
        (setupMethod) => formatSetupMethod(setupMethod) === initialMethod
      );
      if (!isAvailable) {
        return;
      }
      store.selectMethod(initialMethod);
      store.goToConfigure();
    },
    [initialMethod, onboardingState]
  );

  const manualWatchEnabled =
    phase === "progress_waiting_for_config" && selectedMethod === "manual_yaml";

  const setupMutation = useSetupAppDatabaseMutation({
    onProgress: applyProgressEvent,
  });

  const watchState = useWizardWatchState({
    enabled: manualWatchEnabled,
    handleProgressEvent: applyProgressEvent,
    onSuccess: markSetupSuccess,
    setStreamFailure,
    setWatchNotice,
  });

  const { abortSetup, setupRunning } = useSetupExecution({
    getFailedEvent: getFailedOnboardingEvent,
    onSuccess: markSetupSuccess,
    phase,
    runSetupMutation: setupMutation.mutateAsync,
    selectedMethod,
    setConfigureValidationError,
    setStreamFailure,
    setupRunToken,
    submittedEmbeddedConfig,
    submittedPostgresConfig,
  });

  const goBackToConfigure = () => {
    abortSetup();
    goToConfigureStateAction();
  };

  const goBackToMethodSelection = () => {
    abortSetup();
    goBackToMethodSelectionStateAction();
  };

  const finishWizard = () => {
    resetSession();
    onFinish?.();
  };

  return {
    finishWizard,
    goBackToConfigure,
    goBackToMethodSelection,
    refreshOnboardingState,
    retryWatch: watchState.retry,
    setupRunning,
    watchIsRunning: watchState.isRunning,
    watchManualRetryRequired: watchState.manualRetryRequired,
    watchRetryPending: watchState.retryPending,
  };
}

export type { OnboardingWizardController };
