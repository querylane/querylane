import { useEffect } from "react";

import { useSetupExecution } from "@/components/onboarding-wizard/hooks/use-setup-execution";
import { useWizardWatchState } from "@/components/onboarding-wizard/hooks/use-wizard-watch-state";
import { useSetupAppDatabaseMutation } from "@/hooks/api/onboarding";
import { useOnboardingWizardStore } from "@/stores/onboarding-wizard-store";
import { useSetupStore } from "@/stores/setup-store";

interface UseOnboardingWizardControllerOptions {
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

  // allow-useEffect: sync wizard phase state
  useEffect(() => {
    resetSession();
    return () => {
      resetSession();
    };
  }, [resetSession]);

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
