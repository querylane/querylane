import { create as createProto } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";

import { normalizeAppUiError } from "@/lib/ui-error";
import { PostgresConfigSchema } from "@/protogen/querylane/console/v1alpha1/instance_pb";
import {
  EmbeddedSetupConfigSchema,
  SetupProgressEventSchema,
  SetupStep,
  StepState,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import {
  createOnboardingWizardStore,
  DEFAULT_WIZARD_SESSION_STATE,
} from "@/stores/onboarding-wizard-store";

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

describe("onboarding-wizard-store", () => {
  it("startProgress uses the running progress phase for UI setup", () => {
    const useStore = createOnboardingWizardStore();

    useStore.getState().selectMethod("ui_configured");
    useStore.getState().startProgress();

    expect(useStore.getState().phase).toBe("progress_running");
  });

  it("startProgress increments the setup run token", () => {
    const useStore = createOnboardingWizardStore();

    expect(useStore.getState().setupRunToken).toBe(0);

    useStore.getState().startProgress();
    expect(useStore.getState().setupRunToken).toBe(1);

    useStore.getState().startProgress();
    expect(useStore.getState().setupRunToken).toBe(2);
  });

  it("resetSession preserves the setup run token", () => {
    const useStore = createOnboardingWizardStore();

    useStore.getState().startProgress();
    useStore.getState().resetSession();

    expect(useStore.getState().setupRunToken).toBe(1);
  });

  it("startProgress uses the waiting progress phase for manual yaml", () => {
    const useStore = createOnboardingWizardStore();

    useStore.getState().selectMethod("manual_yaml");
    useStore.getState().startProgress();

    expect(useStore.getState().phase).toBe("progress_waiting_for_config");
  });

  it("applyProgressEvent keeps first-seen order and upserts by step id", () => {
    const useStore = createOnboardingWizardStore();

    useStore.getState().applyProgressEvent(
      buildProgressEvent({
        displayName: "Migrate",
        state: StepState.IN_PROGRESS,
        stepId: SetupStep.MIGRATING,
      })
    );
    useStore.getState().applyProgressEvent(
      buildProgressEvent({
        displayName: "Initialize",
        state: StepState.PENDING,
        stepId: SetupStep.INITIALIZING_SERVICES,
      })
    );
    useStore.getState().applyProgressEvent(
      buildProgressEvent({
        displayName: "Migrate",
        state: StepState.SUCCEEDED,
        stepId: SetupStep.MIGRATING,
      })
    );

    const events = useStore.getState().progressEvents;
    expect(events.map((event) => event.stepId)).toEqual([
      SetupStep.MIGRATING,
      SetupStep.INITIALIZING_SERVICES,
    ]);
    expect(events[0]?.state).toBe(StepState.SUCCEEDED);
  });

  it("retryFromErrorSummary returns to the selected progress phase", () => {
    const useStore = createOnboardingWizardStore();

    useStore.getState().selectMethod("manual_yaml");
    useStore.getState().setStreamFailure(
      normalizeAppUiError(new Error("migration failed"), {
        source: "setup_stream",
      })
    );
    useStore.getState().retryFromErrorSummary();

    expect(useStore.getState().phase).toBe("progress_waiting_for_config");
    expect(useStore.getState().streamError).toBeNull();
  });

  it("goToConfigure returns to the path-specific phase", () => {
    const useStore = createOnboardingWizardStore();

    useStore.getState().selectMethod("embedded");
    useStore.getState().goToConfigure();
    expect(useStore.getState().phase).toBe("configure_embedded");

    useStore.getState().startProgress();
    useStore.getState().goToConfigure();
    expect(useStore.getState().phase).toBe("configure_embedded");
  });

  it("markSetupSuccess switches to the success phase", () => {
    const useStore = createOnboardingWizardStore();

    useStore.getState().markSetupSuccess();

    expect(useStore.getState().phase).toBe("progress_success");
  });

  it("resetSession restores default wizard session state", () => {
    const useStore = createOnboardingWizardStore();

    useStore.getState().selectMethod("ui_configured");
    useStore.getState().goToConfigure();
    useStore.getState().setWatchNotice("notice");

    useStore.getState().resetSession();

    const state = useStore.getState();
    expect(state.phase).toBe(DEFAULT_WIZARD_SESSION_STATE.phase);
    expect(state.selectedMethod).toBe(
      DEFAULT_WIZARD_SESSION_STATE.selectedMethod
    );
    expect(state.configureError).toBe(
      DEFAULT_WIZARD_SESSION_STATE.configureError
    );
    expect(state.streamError).toBe(DEFAULT_WIZARD_SESSION_STATE.streamError);
    expect(state.watchNotice).toBe(DEFAULT_WIZARD_SESSION_STATE.watchNotice);
    expect(state.progressEvents).toEqual(
      DEFAULT_WIZARD_SESSION_STATE.progressEvents
    );
    expect(state.failedEvent).toBe(DEFAULT_WIZARD_SESSION_STATE.failedEvent);
  });
});

it("covers configure navigation and direct setters", () => {
  const useStore = createOnboardingWizardStore();
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

  useStore.getState().goToConfigure();
  expect(useStore.getState().phase).toBe("method_selection");

  useStore.getState().selectMethod("manual_yaml");
  useStore.getState().goToConfigure();
  expect(useStore.getState().phase).toBe("configure_yaml");

  useStore.getState().goBackToMethodSelection();
  expect(useStore.getState().phase).toBe("method_selection");

  useStore.getState().setConfigureValidationError(configureError);
  expect(useStore.getState().configureError).toBe(configureError);
  expect(useStore.getState().phase).toBe("configure_yaml");

  useStore.getState().clearStreamFailure();
  expect(useStore.getState().streamError).toBeNull();

  useStore.getState().setSubmittedEmbeddedConfig(embeddedConfig);
  useStore.getState().setSubmittedPostgresConfig(postgresConfig);
  expect(useStore.getState().submittedEmbeddedConfig).toBe(embeddedConfig);
  expect(useStore.getState().submittedPostgresConfig).toBe(postgresConfig);
});

it("records failed progress event and clears stale progress on retry", () => {
  const useStore = createOnboardingWizardStore();
  const failed = buildProgressEvent({
    displayName: "Migrate",
    error: "failed",
    state: StepState.FAILED,
    stepId: SetupStep.MIGRATING,
  });

  useStore.getState().applyProgressEvent(failed);
  expect(useStore.getState().failedEvent).toBe(failed);

  useStore.getState().startProgress();
  expect(useStore.getState().failedEvent).toBeNull();
  expect(useStore.getState().progressEvents).toEqual([]);
});
