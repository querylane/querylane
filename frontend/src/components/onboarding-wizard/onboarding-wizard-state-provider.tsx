import { useReducer } from "react";
import {
  DEFAULT_WIZARD_SESSION_STATE,
  type OnboardingWizardActions,
  type OnboardingWizardState,
  onboardingWizardReducer,
} from "@/components/onboarding-wizard/onboarding-wizard-state";
import {
  OnboardingWizardActionsContext,
  OnboardingWizardStateContext,
} from "@/components/onboarding-wizard/onboarding-wizard-state-context";

function OnboardingWizardStateProvider({
  children,
  initialState,
}: {
  children: React.ReactNode;
  initialState?: Partial<OnboardingWizardState> | undefined;
}) {
  const [state, dispatch] = useReducer(onboardingWizardReducer, {
    ...DEFAULT_WIZARD_SESSION_STATE,
    ...initialState,
  });
  const actions: OnboardingWizardActions = {
    applyProgressEvent: (event) =>
      dispatch({ event, type: "progress_event_applied" }),
    clearStreamFailure: () => dispatch({ type: "stream_failure_cleared" }),
    goBackToMethodSelection: () =>
      dispatch({ type: "method_selection_opened" }),
    goToConfigure: () => dispatch({ type: "configure_opened" }),
    markSetupSuccess: () => dispatch({ type: "setup_succeeded" }),
    resetSession: () => dispatch({ type: "session_reset" }),
    retryFromErrorSummary: () => dispatch({ type: "progress_started" }),
    selectMethod: (method) => dispatch({ method, type: "method_selected" }),
    setConfigureValidationError: (error) =>
      dispatch({ error, type: "configure_validation_failed" }),
    setStreamFailure: (error) => dispatch({ error, type: "stream_failed" }),
    setSubmittedEmbeddedConfig: (config) =>
      dispatch({ config, type: "submitted_embedded_config_set" }),
    setSubmittedPostgresConfig: (config) =>
      dispatch({ config, type: "submitted_postgres_config_set" }),
    setWatchNotice: (notice) => dispatch({ notice, type: "watch_notice_set" }),
    startProgress: () => dispatch({ type: "progress_started" }),
  };

  return (
    <OnboardingWizardStateContext.Provider value={state}>
      <OnboardingWizardActionsContext.Provider value={actions}>
        {children}
      </OnboardingWizardActionsContext.Provider>
    </OnboardingWizardStateContext.Provider>
  );
}

export { OnboardingWizardStateProvider };
