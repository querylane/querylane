import { Code } from "@connectrpc/connect";
import { useEffect, useEffectEvent, useRef } from "react";

import { SETUP_FAILURE_FALLBACK_MESSAGE } from "@/components/onboarding-wizard/constants";
import {
  isAlreadyConfigured,
  shouldAutoRunSetup,
  toConnectError,
} from "@/components/onboarding-wizard/mappers";
import type {
  ConfigMethod,
  WizardPhase,
} from "@/components/onboarding-wizard/types";
import type { SetupAppDatabaseMutationVariables } from "@/hooks/api/onboarding";
import {
  buildEmbeddedSetupRequest,
  buildSetupAppDatabaseRequest,
} from "@/lib/setup-requests";
import { normalizeAppUiError } from "@/lib/ui-error";
import type { AppUiError } from "@/lib/ui-error-types";
import type { PostgresConfig } from "@/protogen/querylane/console/v1alpha1/instance_pb";
import type {
  EmbeddedSetupConfig,
  SetupProgressEvent,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";

interface SetupExecutionOptions {
  getFailedEvent: () => SetupProgressEvent | null;
  onSuccess: () => void;
  phase: WizardPhase;
  runSetupMutation: (
    variables: SetupAppDatabaseMutationVariables
  ) => Promise<void>;
  selectedMethod: ConfigMethod | null;
  setConfigureValidationError: (error: AppUiError) => void;
  setStreamFailure: (error: AppUiError) => void;
  setupRunToken: number;
  submittedEmbeddedConfig: EmbeddedSetupConfig | null;
  submittedPostgresConfig: PostgresConfig | null;
}

type SetupFailureResolution =
  | {
      action: "configure";
      configureError: AppUiError;
    }
  | {
      action: "error_summary";
      streamError: AppUiError;
    }
  | {
      action: "success";
    };

interface ResolveSetupFailureOptions {
  error: unknown;
  failedEvent: SetupProgressEvent | null;
}

function resolveSetupFailureAction({
  error,
  failedEvent,
}: ResolveSetupFailureOptions): SetupFailureResolution {
  const connectError = toConnectError(error);
  const failureContext = {
    area: "onboarding-setup",
    stepDisplayName: failedEvent?.displayName || undefined,
    stepId: failedEvent?.stepId || undefined,
  } as const;
  const fallbackError =
    error instanceof Error ? error : new Error(SETUP_FAILURE_FALLBACK_MESSAGE);

  if (isAlreadyConfigured(connectError)) {
    return { action: "success" };
  }

  if (connectError.code === Code.InvalidArgument) {
    return {
      action: "configure",
      configureError: normalizeAppUiError(connectError, {
        ...failureContext,
        source: "setup",
      }),
    };
  }

  return {
    action: "error_summary",
    streamError: normalizeAppUiError(
      failedEvent?.error ? new Error(failedEvent.error) : fallbackError,
      {
        ...failureContext,
        source: failedEvent ? "setup_stream" : "setup",
      }
    ),
  };
}

async function executeSetupRequest({
  controller,
  runSetupMutation,
  selectedMethod,
  submittedEmbeddedConfig,
  submittedPostgresConfig,
}: {
  controller: AbortController;
  runSetupMutation: (
    variables: SetupAppDatabaseMutationVariables
  ) => Promise<void>;
  selectedMethod: "embedded" | "ui_configured";
  submittedEmbeddedConfig: EmbeddedSetupConfig | null;
  submittedPostgresConfig: PostgresConfig | null;
}) {
  const request =
    selectedMethod === "ui_configured" && submittedPostgresConfig
      ? buildSetupAppDatabaseRequest(submittedPostgresConfig)
      : buildEmbeddedSetupRequest(
          submittedEmbeddedConfig
            ? {
                mode:
                  submittedEmbeddedConfig.mode === "ephemeral"
                    ? "ephemeral"
                    : "persistent",
                port: submittedEmbeddedConfig.port || undefined,
              }
            : undefined
        );

  await runSetupMutation({
    request,
    signal: controller.signal,
  });
}

function useSetupExecution({
  getFailedEvent,
  onSuccess,
  phase,
  runSetupMutation,
  selectedMethod,
  setupRunToken,
  setConfigureValidationError,
  setStreamFailure,
  submittedEmbeddedConfig,
  submittedPostgresConfig,
}: SetupExecutionOptions) {
  const setupAbortRef = useRef<AbortController | null>(null);
  const setupRequestOptionsRef = useRef({
    phase,
    runSetupMutation,
    selectedMethod,
    submittedEmbeddedConfig,
    submittedPostgresConfig,
  });
  const setupRunning = shouldAutoRunSetup(phase, selectedMethod);

  const abortSetup = () => {
    setupAbortRef.current?.abort();
  };

  const handleSetupSuccess = useEffectEvent(function notifySetupSuccess() {
    onSuccess();
  });

  const handleSetupFailure = useEffectEvent(function resolveSetupFailure(
    error: unknown
  ) {
    const resolution = resolveSetupFailureAction({
      error,
      failedEvent: getFailedEvent(),
    });

    if (resolution.action === "success") {
      onSuccess();
      return;
    }

    if (resolution.action === "configure") {
      setConfigureValidationError(resolution.configureError);
      return;
    }

    setStreamFailure(resolution.streamError);
  });

  // allow-useEffect: keep setup inputs current without restarting execution
  useEffect(function syncSetupExecutionOptions() {
    setupRequestOptionsRef.current = {
      phase,
      runSetupMutation,
      selectedMethod,
      submittedEmbeddedConfig,
      submittedPostgresConfig,
    };
  });

  // allow-useEffect: execute each explicitly requested setup run
  useEffect(
    function executeSetupRun() {
      const currentOptions = setupRequestOptionsRef.current;
      if (
        setupRunToken === 0 ||
        !shouldAutoRunSetup(currentOptions.phase, currentOptions.selectedMethod)
      ) {
        return;
      }

      const controller = new AbortController();
      setupAbortRef.current = controller;

      executeSetupRequest({
        controller,
        runSetupMutation: currentOptions.runSetupMutation,
        selectedMethod: currentOptions.selectedMethod,
        submittedEmbeddedConfig: currentOptions.submittedEmbeddedConfig,
        submittedPostgresConfig: currentOptions.submittedPostgresConfig,
      }).then(
        () => {
          handleSetupSuccess();
        },
        (error) => {
          if (!controller.signal.aborted) {
            handleSetupFailure(error);
          }
        }
      );

      return () => {
        controller.abort();
      };
    },
    [setupRunToken]
  );

  return { abortSetup, setupRunning };
}

export { resolveSetupFailureAction, useSetupExecution };
