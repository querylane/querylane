import type {
  ConfigMethod,
  WizardPhase,
} from "@/components/onboarding-wizard/types";
import type { AppUiError } from "@/lib/ui-error-types";
import type { PostgresConfig } from "@/protogen/querylane/console/v1alpha1/instance_pb";
import {
  type EmbeddedSetupConfig,
  type SetupProgressEvent,
  StepState,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";

interface OnboardingWizardState {
  configureError: AppUiError | null;
  failedEvent: SetupProgressEvent | null;
  phase: WizardPhase;
  progressEvents: SetupProgressEvent[];
  selectedMethod: ConfigMethod | null;
  setupRunToken: number;
  streamError: AppUiError | null;
  submittedEmbeddedConfig: EmbeddedSetupConfig | null;
  submittedPostgresConfig: PostgresConfig | null;
  watchNotice: string | null;
}

interface OnboardingWizardActions {
  applyProgressEvent: (event: SetupProgressEvent) => void;
  clearStreamFailure: () => void;
  goBackToMethodSelection: () => void;
  goToConfigure: () => void;
  markSetupSuccess: () => void;
  resetSession: () => void;
  retryFromErrorSummary: () => void;
  selectMethod: (method: ConfigMethod) => void;
  setConfigureValidationError: (error: AppUiError) => void;
  setStreamFailure: (error: AppUiError) => void;
  setSubmittedEmbeddedConfig: (config: EmbeddedSetupConfig) => void;
  setSubmittedPostgresConfig: (config: PostgresConfig) => void;
  setWatchNotice: (notice: string | null) => void;
  startProgress: () => void;
}

type OnboardingWizardAction =
  | { event: SetupProgressEvent; type: "progress_event_applied" }
  | { error: AppUiError; type: "configure_validation_failed" }
  | { error: AppUiError; type: "stream_failed" }
  | { method: ConfigMethod; type: "method_selected" }
  | { notice: string | null; type: "watch_notice_set" }
  | { type: "configure_opened" }
  | { type: "method_selection_opened" }
  | { type: "progress_started" }
  | { type: "session_reset" }
  | { type: "setup_succeeded" }
  | { type: "stream_failure_cleared" }
  | { config: EmbeddedSetupConfig; type: "submitted_embedded_config_set" }
  | { config: PostgresConfig; type: "submitted_postgres_config_set" };

const DEFAULT_WIZARD_SESSION_STATE: OnboardingWizardState = {
  configureError: null,
  failedEvent: null,
  phase: "method_selection",
  progressEvents: [],
  selectedMethod: null,
  setupRunToken: 0,
  streamError: null,
  submittedEmbeddedConfig: null,
  submittedPostgresConfig: null,
  watchNotice: null,
};

function getConfigurePhaseForMethod(
  method: ConfigMethod | null
): Extract<
  WizardPhase,
  "configure_embedded" | "configure_ui" | "configure_yaml" | "method_selection"
> {
  if (method === "ui_configured") {
    return "configure_ui";
  }
  if (method === "manual_yaml") {
    return "configure_yaml";
  }
  if (method === "embedded") {
    return "configure_embedded";
  }
  return "method_selection";
}

function getProgressPhaseForMethod(
  method: ConfigMethod | null
): Extract<WizardPhase, "progress_running" | "progress_waiting_for_config"> {
  return method === "manual_yaml"
    ? "progress_waiting_for_config"
    : "progress_running";
}

function upsertProgressEvent(
  events: SetupProgressEvent[],
  incoming: SetupProgressEvent
) {
  const existingIndex = events.findIndex(
    (event) => event.stepId === incoming.stepId
  );
  if (existingIndex === -1) {
    return [...events, incoming];
  }
  return events.map((event, index) =>
    index === existingIndex ? incoming : event
  );
}

function startProgress(state: OnboardingWizardState): OnboardingWizardState {
  return {
    ...state,
    configureError: null,
    failedEvent: null,
    phase: getProgressPhaseForMethod(state.selectedMethod),
    progressEvents: [],
    setupRunToken: state.setupRunToken + 1,
    streamError: null,
    watchNotice: null,
  };
}

function onboardingWizardReducer(
  state: OnboardingWizardState,
  action: OnboardingWizardAction
): OnboardingWizardState {
  switch (action.type) {
    case "progress_event_applied":
      return {
        ...state,
        failedEvent:
          action.event.state === StepState.FAILED
            ? action.event
            : state.failedEvent,
        progressEvents: upsertProgressEvent(state.progressEvents, action.event),
      };
    case "stream_failure_cleared":
      return { ...state, streamError: null };
    case "method_selection_opened":
      return {
        ...state,
        configureError: null,
        phase: "method_selection",
      };
    case "configure_opened":
      return {
        ...state,
        configureError: null,
        phase: getConfigurePhaseForMethod(state.selectedMethod),
      };
    case "setup_succeeded":
      return { ...state, phase: "progress_success", watchNotice: null };
    case "session_reset":
      return {
        ...DEFAULT_WIZARD_SESSION_STATE,
        setupRunToken: state.setupRunToken,
      };
    case "method_selected":
      return { ...state, selectedMethod: action.method };
    case "configure_validation_failed":
      return {
        ...state,
        configureError: action.error,
        phase: getConfigurePhaseForMethod(state.selectedMethod),
      };
    case "stream_failed":
      return {
        ...state,
        phase: "error_summary",
        streamError: action.error,
      };
    case "submitted_embedded_config_set":
      return { ...state, submittedEmbeddedConfig: action.config };
    case "submitted_postgres_config_set":
      return { ...state, submittedPostgresConfig: action.config };
    case "watch_notice_set":
      return { ...state, watchNotice: action.notice };
    case "progress_started":
      return startProgress(state);
    default:
      return action satisfies never;
  }
}

export type {
  OnboardingWizardAction,
  OnboardingWizardActions,
  OnboardingWizardState,
};
export { DEFAULT_WIZARD_SESSION_STATE, onboardingWizardReducer };
