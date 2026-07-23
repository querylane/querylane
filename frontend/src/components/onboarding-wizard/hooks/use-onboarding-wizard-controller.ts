import { useEffect, useRef } from "react";

import { useSetupExecution } from "@/components/onboarding-wizard/hooks/use-setup-execution";
import { useWizardWatchState } from "@/components/onboarding-wizard/hooks/use-wizard-watch-state";
import {
  useOnboardingWizardActions,
  useOnboardingWizardState,
} from "@/components/onboarding-wizard/onboarding-wizard-state-context";
import { useSetup } from "@/components/setup-context";
import { useSetupAppDatabaseMutation } from "@/hooks/api/onboarding";
import { StepState } from "@/protogen/querylane/console/v1alpha1/onboarding_pb";

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
  const state = useOnboardingWizardState();
  const actions = useOnboardingWizardActions();
  const failedEventRef = useRef(state.failedEvent);

  useEffect(
    function syncFailedProgressEvent() {
      failedEventRef.current = state.failedEvent;
    },
    [state.failedEvent]
  );

  return {
    ...actions,
    ...state,
    applyProgressEvent: (
      event: Parameters<typeof actions.applyProgressEvent>[0]
    ) => {
      if (event.state === StepState.FAILED) {
        failedEventRef.current = event;
      }
      actions.applyProgressEvent(event);
    },
    getFailedEvent: () => failedEventRef.current,
  };
}

export function useOnboardingWizardController({
  onFinish,
}: UseOnboardingWizardControllerOptions): OnboardingWizardController {
  const {
    applyProgressEvent,
    getFailedEvent,
    goBackToMethodSelection: goBackToMethodSelectionStateAction,
    goToConfigure: goToConfigureStateAction,
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
  const { refreshOnboardingState } = useSetup();

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
    getFailedEvent,
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
