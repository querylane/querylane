import { create as createProto } from "@bufbuild/protobuf";

import { buildTestInstanceConnectionRequest as buildStandaloneTestConnectionRequest } from "@/lib/instance-connection";
import { attachAppUiErrorContext } from "@/lib/ui-error";
import type { PostgresConfig } from "@/protogen/querylane/console/v1alpha1/instance_pb";
import { PostgresConfigSchema } from "@/protogen/querylane/console/v1alpha1/instance_pb";
import {
  EmbeddedSetupConfigSchema,
  SetupAppDatabaseRequestSchema,
  type SetupAppDatabaseResponse,
  type SetupProgressEvent,
  SetupStep,
  StepState,
  type WatchConfigChangesResponse,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";

const DEFAULT_EMBEDDED_PORT = 5433;
type StepProgressCallback = (event: SetupProgressEvent) => void;

interface SetupStreamFailure {
  failedEvent: SetupProgressEvent;
  message: string;
}

function buildPostgresConfig(config: PostgresConfig) {
  return createProto(PostgresConfigSchema, {
    database: config.database,
    host: config.host,
    password: config.password,
    port: config.port,
    sslMode: config.sslMode,
    sslNegotiation: config.sslNegotiation,
    username: config.username,
  });
}

function buildSetupAppDatabaseRequest(config: PostgresConfig) {
  return createProto(SetupAppDatabaseRequestSchema, {
    setup: {
      case: "postgresConfig",
      value: buildPostgresConfig(config),
    },
  });
}

function buildEmbeddedSetupRequest(config?: {
  mode?: "ephemeral" | "persistent" | undefined;
  port?: number | undefined;
}) {
  return createProto(SetupAppDatabaseRequestSchema, {
    setup: {
      case: "embeddedConfig",
      value: createProto(EmbeddedSetupConfigSchema, {
        mode: config?.mode ?? "persistent",
        port: config?.port ?? DEFAULT_EMBEDDED_PORT,
      }),
    },
  });
}

function buildConnectionTestRequest(config: PostgresConfig) {
  return buildStandaloneTestConnectionRequest(buildPostgresConfig(config));
}

function getProgressFailureMessage(
  event: SetupProgressEvent | undefined
): SetupStreamFailure | null {
  if (!event || event.state !== StepState.FAILED) {
    return null;
  }

  return {
    failedEvent: event,
    message: event.error || event.displayName || "Database setup failed",
  };
}

function createSetupStreamFailureError(failure: SetupStreamFailure) {
  const error = new Error(failure.message);
  attachAppUiErrorContext(error, {
    area: "setup-stream",
    source: "setup_stream",
    stepDisplayName: failure.failedEvent.displayName || undefined,
    stepId: failure.failedEvent.stepId || undefined,
  });
  return Object.assign(error, {
    failedEvent: failure.failedEvent,
  });
}

async function consumeSetupStreamWithProgress(
  stream: AsyncIterable<SetupAppDatabaseResponse>,
  onProgress: StepProgressCallback
): Promise<SetupStreamFailure | null> {
  let failureMessage: SetupStreamFailure | null = null;
  let setupCompleted = false;

  for await (const response of stream) {
    const { event } = response;
    if (event) {
      onProgress(event);
      if (
        event.stepId === SetupStep.PERSISTING_CONFIG &&
        event.state === StepState.SUCCEEDED
      ) {
        setupCompleted = true;
      }
    }

    const message = getProgressFailureMessage(event);
    if (message) {
      failureMessage = message;
    }
  }

  if (failureMessage) {
    return failureMessage;
  }

  if (!setupCompleted) {
    throw new Error("Database setup stream ended before setup completed");
  }

  return null;
}

async function consumeWatchStreamWithProgress(
  stream: AsyncIterable<WatchConfigChangesResponse>,
  onProgress: StepProgressCallback
): Promise<SetupStreamFailure | null> {
  let failureMessage: SetupStreamFailure | null = null;

  for await (const response of stream) {
    const { event } = response;
    if (event) {
      onProgress(event);
    }

    const message = getProgressFailureMessage(event);
    if (message) {
      failureMessage = message;
    }
  }

  return failureMessage;
}

export type { StepProgressCallback };
export {
  buildConnectionTestRequest,
  buildEmbeddedSetupRequest,
  buildSetupAppDatabaseRequest,
  consumeSetupStreamWithProgress,
  consumeWatchStreamWithProgress,
  createSetupStreamFailureError,
};
