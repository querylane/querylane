import { create } from "zustand";

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

interface OnboardingWizardSessionState {
  configureError: AppUiError | null;
  failedEvent: SetupProgressEvent | null;
  phase: WizardPhase;
  progressEvents: SetupProgressEvent[];
  selectedMethod: ConfigMethod | null;
  streamError: AppUiError | null;
  submittedEmbeddedConfig: EmbeddedSetupConfig | null;
  submittedPostgresConfig: PostgresConfig | null;
  watchNotice: string | null;
}

interface OnboardingWizardStore extends OnboardingWizardSessionState {
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

const DEFAULT_WIZARD_SESSION_STATE: OnboardingWizardSessionState = {
  configureError: null,
  failedEvent: null,
  phase: "method_selection",
  progressEvents: [],
  selectedMethod: null,
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
  if (method === "manual_yaml") {
    return "progress_waiting_for_config";
  }

  return "progress_running";
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

  const updated = [...events];
  updated[existingIndex] = incoming;
  return updated;
}

export function createOnboardingWizardStore() {
  return create<OnboardingWizardStore>()((set, get) => ({
    ...DEFAULT_WIZARD_SESSION_STATE,

    applyProgressEvent: (event) => {
      set((state) => ({
        failedEvent:
          event.state === StepState.FAILED ? event : state.failedEvent,
        progressEvents: upsertProgressEvent(state.progressEvents, event),
      }));
    },

    clearStreamFailure: () => {
      set({
        streamError: null,
      });
    },

    goBackToMethodSelection: () => {
      set({
        configureError: null,
        phase: "method_selection",
      });
    },

    goToConfigure: () => {
      set((state) => ({
        configureError: null,
        phase: getConfigurePhaseForMethod(state.selectedMethod),
      }));
    },

    markSetupSuccess: () => {
      set({
        phase: "progress_success",
        watchNotice: null,
      });
    },

    resetSession: () => {
      set(DEFAULT_WIZARD_SESSION_STATE);
    },

    retryFromErrorSummary: () => {
      get().startProgress();
    },

    selectMethod: (method) => {
      set({
        selectedMethod: method,
      });
    },

    setConfigureValidationError: (error) => {
      set((state) => ({
        configureError: error,
        phase: getConfigurePhaseForMethod(state.selectedMethod),
      }));
    },

    setStreamFailure: (error) => {
      set({
        phase: "error_summary",
        streamError: error,
      });
    },

    setSubmittedEmbeddedConfig: (config) => {
      set({ submittedEmbeddedConfig: config });
    },

    setSubmittedPostgresConfig: (config) => {
      set({ submittedPostgresConfig: config });
    },

    setWatchNotice: (notice) => {
      set({
        watchNotice: notice,
      });
    },

    startProgress: () => {
      set((state) => ({
        configureError: null,
        failedEvent: null,
        phase: getProgressPhaseForMethod(state.selectedMethod),
        progressEvents: [],
        streamError: null,
        watchNotice: null,
      }));
    },
  }));
}

export const useOnboardingWizardStore = createOnboardingWizardStore();
export { DEFAULT_WIZARD_SESSION_STATE };
