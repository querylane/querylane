import { create as createProto } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WIZARD_SESSION_STATE,
  type OnboardingWizardAction,
  type OnboardingWizardState,
  onboardingWizardReducer,
} from "@/components/onboarding-wizard/onboarding-wizard-state";
import { normalizeAppUiError } from "@/lib/ui-error";
import { PostgresConfigSchema } from "@/protogen/querylane/console/v1alpha1/instance_pb";
import {
  EmbeddedSetupConfigSchema,
  SetupProgressEventSchema,
  SetupStep,
  StepState,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";

function createStateMachine() {
  let state = DEFAULT_WIZARD_SESSION_STATE;
  return {
    dispatch(action: OnboardingWizardAction) {
      state = onboardingWizardReducer(state, action);
    },
    getState(): OnboardingWizardState {
      return state;
    },
  };
}

function buildProgressEvent({
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
  return createProto(SetupProgressEventSchema, {
    displayName,
    error,
    state,
    stepId,
  });
}

describe("onboarding wizard reducer", () => {
  it("starts running progress for UI setup", () => {
    const machine = createStateMachine();

    machine.dispatch({ method: "ui_configured", type: "method_selected" });
    machine.dispatch({ type: "progress_started" });

    expect(machine.getState().phase).toBe("progress_running");
  });

  it("increments the setup run token for each progress attempt", () => {
    const machine = createStateMachine();

    machine.dispatch({ type: "progress_started" });
    machine.dispatch({ type: "progress_started" });

    expect(machine.getState().setupRunToken).toBe(2);
  });

  it("preserves the setup run token when resetting the session", () => {
    const machine = createStateMachine();

    machine.dispatch({ type: "progress_started" });
    machine.dispatch({ type: "session_reset" });

    expect(machine.getState().setupRunToken).toBe(1);
  });

  it("starts waiting progress for manual YAML setup", () => {
    const machine = createStateMachine();

    machine.dispatch({ method: "manual_yaml", type: "method_selected" });
    machine.dispatch({ type: "progress_started" });

    expect(machine.getState().phase).toBe("progress_waiting_for_config");
  });

  it("keeps first-seen progress order and upserts by step id", () => {
    const machine = createStateMachine();
    const migrating = buildProgressEvent({
      displayName: "Migrate",
      state: StepState.IN_PROGRESS,
      stepId: SetupStep.MIGRATING,
    });
    const initializing = buildProgressEvent({
      displayName: "Initialize",
      state: StepState.PENDING,
      stepId: SetupStep.INITIALIZING_SERVICES,
    });
    const migrated = buildProgressEvent({
      displayName: "Migrate",
      state: StepState.SUCCEEDED,
      stepId: SetupStep.MIGRATING,
    });

    machine.dispatch({ event: migrating, type: "progress_event_applied" });
    machine.dispatch({ event: initializing, type: "progress_event_applied" });
    machine.dispatch({ event: migrated, type: "progress_event_applied" });

    expect(machine.getState().progressEvents).toEqual([migrated, initializing]);
  });

  it("retries from the error summary using the selected progress phase", () => {
    const machine = createStateMachine();
    const error = normalizeAppUiError(new Error("migration failed"), {
      source: "setup_stream",
    });

    machine.dispatch({ method: "manual_yaml", type: "method_selected" });
    machine.dispatch({ error, type: "stream_failed" });
    machine.dispatch({ type: "progress_started" });

    expect(machine.getState().phase).toBe("progress_waiting_for_config");
    expect(machine.getState().streamError).toBeNull();
  });

  it("returns to the selected configure phase", () => {
    const machine = createStateMachine();

    machine.dispatch({ method: "embedded", type: "method_selected" });
    machine.dispatch({ type: "configure_opened" });
    expect(machine.getState().phase).toBe("configure_embedded");

    machine.dispatch({ type: "progress_started" });
    machine.dispatch({ type: "configure_opened" });
    expect(machine.getState().phase).toBe("configure_embedded");
  });

  it("switches to the success phase", () => {
    const machine = createStateMachine();

    machine.dispatch({ type: "setup_succeeded" });

    expect(machine.getState().phase).toBe("progress_success");
  });

  it("restores the default session state", () => {
    const machine = createStateMachine();

    machine.dispatch({ method: "ui_configured", type: "method_selected" });
    machine.dispatch({ type: "configure_opened" });
    machine.dispatch({ notice: "notice", type: "watch_notice_set" });
    machine.dispatch({ type: "session_reset" });

    expect(machine.getState()).toEqual(DEFAULT_WIZARD_SESSION_STATE);
  });

  it("handles configure navigation and submitted configs", () => {
    const machine = createStateMachine();
    const configureError = normalizeAppUiError(new Error("bad config"), {
      source: "setup",
    });
    const embeddedConfig = createProto(EmbeddedSetupConfigSchema, {
      mode: "persistent",
      port: 5433,
    });
    const postgresConfig = createProto(PostgresConfigSchema, {
      database: "querylane",
      host: "localhost",
      port: 5432,
      username: "querylane",
    });

    machine.dispatch({ method: "manual_yaml", type: "method_selected" });
    machine.dispatch({ type: "configure_opened" });
    machine.dispatch({ type: "method_selection_opened" });
    machine.dispatch({
      error: configureError,
      type: "configure_validation_failed",
    });
    machine.dispatch({
      config: embeddedConfig,
      type: "submitted_embedded_config_set",
    });
    machine.dispatch({
      config: postgresConfig,
      type: "submitted_postgres_config_set",
    });

    expect(machine.getState()).toMatchObject({
      configureError,
      phase: "configure_yaml",
      submittedEmbeddedConfig: embeddedConfig,
      submittedPostgresConfig: postgresConfig,
    });
  });

  it("records a failed event and clears stale progress on retry", () => {
    const machine = createStateMachine();
    const failed = buildProgressEvent({
      displayName: "Migrate",
      error: "failed",
      state: StepState.FAILED,
      stepId: SetupStep.MIGRATING,
    });

    machine.dispatch({ event: failed, type: "progress_event_applied" });
    expect(machine.getState().failedEvent).toBe(failed);

    machine.dispatch({ type: "progress_started" });
    expect(machine.getState().failedEvent).toBeNull();
    expect(machine.getState().progressEvents).toEqual([]);
  });
});
