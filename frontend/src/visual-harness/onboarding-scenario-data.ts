import { create } from "@bufbuild/protobuf";
import type { OnboardingWizardController } from "@/components/onboarding-wizard/hooks/use-onboarding-wizard-controller";
import { normalizeAppUiError } from "@/lib/ui-error";
import {
  AppDatabaseStatus_State,
  AppDatabaseStatusSchema,
} from "@/protogen/querylane/console/v1alpha1/console_pb";
import {
  GetOnboardingStateResponseSchema,
  SetupMethod,
  SetupProgressEventSchema,
  SetupStep,
  StepState,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import type { useOnboardingWizardStore } from "@/stores/onboarding-wizard-store";

// Wizard sessions the /setup route cannot reach without a live setup stream.
// The scenario components seed the wizard stores with these before rendering.

type WizardSession = Partial<
  ReturnType<typeof useOnboardingWizardStore.getState>
>;

const SETUP_STREAM_ENDPOINT =
  "/querylane.console.v1alpha1.ConsoleService/Setup";
const SETUP_FAILURE_MESSAGE =
  "password authentication failed for user querylane";
const STORAGE_FULL_ERROR_MESSAGE =
  "extract /Users/you/.querylane/embedded-postgres: no space left on device";

function onboardingState() {
  return create(GetOnboardingStateResponseSchema, {
    appDatabaseStatus: create(AppDatabaseStatusSchema, {
      state: AppDatabaseStatus_State.NOT_CONFIGURED,
    }),
    availableMethods: [
      SetupMethod.UI_CONFIGURED,
      SetupMethod.MANUAL_YAML,
      SetupMethod.EMBEDDED,
    ],
    configFilePath: "/Users/you/.querylane/config.yaml",
    embeddedDataPath: "/Users/you/.querylane/pgdata",
    homePath: "/Users/you/.querylane",
    isConfigured: false,
    isHomeWritable: true,
  });
}

function progressEvent({
  displayName,
  error = "",
  state,
  stepId,
}: {
  displayName: string;
  error?: string;
  state: StepState;
  stepId: SetupStep;
}) {
  return create(SetupProgressEventSchema, {
    displayName,
    error,
    state,
    stepId,
  });
}

function createIdleOnboardingController(
  overrides: Partial<OnboardingWizardController> = {}
): OnboardingWizardController {
  return {
    finishWizard: () => undefined,
    goBackToConfigure: () => undefined,
    goBackToMethodSelection: () => undefined,
    refreshOnboardingState: () => Promise.resolve(),
    retryWatch: () => Promise.resolve(),
    setupRunning: false,
    watchIsRunning: false,
    watchManualRetryRequired: false,
    watchRetryPending: false,
    ...overrides,
  };
}

function setupStreamError(message: string) {
  return normalizeAppUiError(new Error(message), {
    endpoint: SETUP_STREAM_ENDPOINT,
    source: "setup_stream",
  });
}

const PROGRESS_RUNNING_SESSION: WizardSession = {
  phase: "progress_running",
  progressEvents: [
    progressEvent({
      displayName: "Connect to PostgreSQL",
      state: StepState.SUCCEEDED,
      stepId: SetupStep.CONNECTING,
    }),
    progressEvent({
      displayName: "Apply migrations",
      state: StepState.IN_PROGRESS,
      stepId: SetupStep.MIGRATING,
    }),
    progressEvent({
      displayName: "Initialize services",
      state: StepState.PENDING,
      stepId: SetupStep.INITIALIZING_SERVICES,
    }),
  ],
  selectedMethod: "ui_configured",
};

const PROGRESS_FAILED_SESSION: WizardSession = {
  failedEvent: progressEvent({
    displayName: "Apply migrations",
    error: SETUP_FAILURE_MESSAGE,
    state: StepState.FAILED,
    stepId: SetupStep.MIGRATING,
  }),
  phase: "error_summary",
  progressEvents: [
    progressEvent({
      displayName: "Connect to PostgreSQL",
      state: StepState.SUCCEEDED,
      stepId: SetupStep.CONNECTING,
    }),
    progressEvent({
      displayName: "Apply migrations",
      error: SETUP_FAILURE_MESSAGE,
      state: StepState.FAILED,
      stepId: SetupStep.MIGRATING,
    }),
  ],
  selectedMethod: "ui_configured",
  streamError: setupStreamError(SETUP_FAILURE_MESSAGE),
};

const STORAGE_FULL_SESSION: WizardSession = {
  failedEvent: progressEvent({
    displayName: "Start embedded PostgreSQL",
    error: STORAGE_FULL_ERROR_MESSAGE,
    state: StepState.FAILED,
    stepId: SetupStep.STARTING_EMBEDDED,
  }),
  phase: "error_summary",
  progressEvents: [
    progressEvent({
      displayName: "Start embedded PostgreSQL",
      error: STORAGE_FULL_ERROR_MESSAGE,
      state: StepState.FAILED,
      stepId: SetupStep.STARTING_EMBEDDED,
    }),
  ],
  selectedMethod: "embedded",
  streamError: setupStreamError(STORAGE_FULL_ERROR_MESSAGE),
};

const PROGRESS_SUCCESS_SESSION: WizardSession = {
  phase: "progress_success",
  progressEvents: [
    progressEvent({
      displayName: "Connect to PostgreSQL",
      state: StepState.SUCCEEDED,
      stepId: SetupStep.CONNECTING,
    }),
    progressEvent({
      displayName: "Apply migrations",
      state: StepState.SUCCEEDED,
      stepId: SetupStep.MIGRATING,
    }),
    progressEvent({
      displayName: "Initialize services",
      state: StepState.SUCCEEDED,
      stepId: SetupStep.INITIALIZING_SERVICES,
    }),
  ],
  selectedMethod: "ui_configured",
};

const YAML_WAITING_SESSION: WizardSession = {
  phase: "progress_waiting_for_config",
  selectedMethod: "manual_yaml",
};

export type { WizardSession };
export {
  createIdleOnboardingController,
  onboardingState,
  PROGRESS_FAILED_SESSION,
  PROGRESS_RUNNING_SESSION,
  PROGRESS_SUCCESS_SESSION,
  STORAGE_FULL_ERROR_MESSAGE,
  STORAGE_FULL_SESSION,
  YAML_WAITING_SESSION,
};
