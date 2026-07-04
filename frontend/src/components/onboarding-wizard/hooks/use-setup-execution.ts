import { Code } from "@connectrpc/connect";
import { useEffect, useRef } from "react";

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
  onSuccess,
  runSetupMutation,
  selectedMethod,
  submittedEmbeddedConfig,
  submittedPostgresConfig,
}: {
  controller: AbortController;
  onSuccess: () => void;
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

  onSuccess();
}

function useSetupExecution({
  getFailedEvent,
  onSuccess,
  phase,
  runSetupMutation,
  selectedMethod,
  setConfigureValidationError,
  setStreamFailure,
  submittedEmbeddedConfig,
  submittedPostgresConfig,
}: SetupExecutionOptions) {
  const setupAbortRef = useRef<AbortController | null>(null);
  const setupRunning = shouldAutoRunSetup(phase, selectedMethod);

  const abortSetup = () => {
    setupAbortRef.current?.abort();
  };

  // allow-useEffect: sync setup execution state
  useEffect(
    () => () => {
      setupAbortRef.current?.abort();
    },
    []
  );

  // allow-useEffect: sync setup execution state
  useEffect(() => {
    if (!shouldAutoRunSetup(phase, selectedMethod)) {
      return;
    }

    const controller = new AbortController();
    setupAbortRef.current = controller;

    executeSetupRequest({
      controller,
      onSuccess,
      runSetupMutation,
      selectedMethod,
      submittedEmbeddedConfig,
      submittedPostgresConfig,
    }).catch((error) => {
      if (controller.signal.aborted) {
        return;
      }

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

    return () => {
      controller.abort();
    };
  }, [
    getFailedEvent,
    onSuccess,
    phase,
    runSetupMutation,
    selectedMethod,
    setConfigureValidationError,
    setStreamFailure,
    submittedEmbeddedConfig,
    submittedPostgresConfig,
  ]);

  return { abortSetup, setupRunning };
}

export { resolveSetupFailureAction, useSetupExecution };
