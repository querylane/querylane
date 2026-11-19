import type { useTransport } from "@connectrpc/connect-query";
import type { useQueryClient } from "@tanstack/react-query";
import type { useNavigate } from "@tanstack/react-router";
import {
  buildCreateInstanceRequest,
  buildTestConnectionRequest,
  type CreateInstanceFormState,
  type InlineNotice,
} from "@/features/new-instance-workflow";
import {
  databasesForInstanceQueryInput,
  listAllDatabasesQueryOptions,
} from "@/hooks/api/database";
import type {
  useCreateInstanceMutation,
  useTestInstanceConnectionMutation,
} from "@/hooks/api/instance";
import { parseResourceLeafId } from "@/lib/console-resources";
import { resolveCreateInstanceSuccessTarget } from "@/lib/create-instance-navigation";
import { logger } from "@/lib/diagnostics";
import { isNavigationCancellationError } from "@/lib/navigation-errors";
import { isNonEmptyString } from "@/lib/value-guards";

interface CreateInstanceSubmissionOutcome {
  error: unknown;
  notice: InlineNotice | null;
}

const CREATE_INSTANCE_DISCOVERY_GRACE_MS = 50;

function successOutcome(notice: InlineNotice | null) {
  return { error: null, notice } satisfies CreateInstanceSubmissionOutcome;
}

function errorOutcome(error: unknown) {
  return { error, notice: null } satisfies CreateInstanceSubmissionOutcome;
}

async function testInstanceConnection({
  formState,
  mutateAsync,
}: {
  formState: CreateInstanceFormState;
  mutateAsync: ReturnType<
    typeof useTestInstanceConnectionMutation
  >["mutateAsync"];
}) {
  try {
    await mutateAsync(buildTestConnectionRequest(formState));
    return successOutcome({
      message: "Connection successful.",
      variant: "success",
    });
  } catch (error) {
    return errorOutcome(error);
  }
}

function nonBlockingErrorPayload(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }

  return {
    message: String(error),
    name: typeof error,
  };
}

function logCreateInstanceNonBlockingFailure(
  step: "list-databases" | "navigate",
  error: unknown
) {
  logger.warn("Non-blocking create instance follow-up failed", {
    error: nonBlockingErrorPayload(error),
    step,
  });
}

async function fetchCreatedInstanceDatabases({
  instanceId,
  queryClient,
  transport,
}: {
  instanceId: string | undefined;
  queryClient: ReturnType<typeof useQueryClient>;
  transport: ReturnType<typeof useTransport>;
}) {
  if (!isNonEmptyString(instanceId)) {
    return [];
  }

  try {
    const response = await queryClient.query({
      ...listAllDatabasesQueryOptions({
        input: databasesForInstanceQueryInput(instanceId),
        transport,
      }),
      staleTime: 0,
    });
    return response.databases;
  } catch (error) {
    logCreateInstanceNonBlockingFailure("list-databases", error);
    return [];
  }
}

function settleImmediate<T>(promise: Promise<T>, fallback: T) {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => {
        resolve(fallback);
      }, CREATE_INSTANCE_DISCOVERY_GRACE_MS);
    }),
  ]);
}

async function navigateAfterCreate({
  navigate,
  target,
}: {
  navigate: ReturnType<typeof useNavigate>;
  target: ReturnType<typeof resolveCreateInstanceSuccessTarget>;
}) {
  try {
    await navigate({
      ...target,
      search: {},
    });
    return null;
  } catch (error) {
    if (isNavigationCancellationError(error)) {
      logger.debug("Create instance success navigation was cancelled", {
        error: nonBlockingErrorPayload(error),
      });
      return null;
    }

    logCreateInstanceNonBlockingFailure("navigate", error);
    return {
      message:
        "Instance created, but Querylane could not open it automatically. Use the instance list to open it.",
      variant: "error",
    } satisfies InlineNotice | null;
  }
}

async function createInstanceAndNavigate({
  formState,
  mutateAsync,
  navigate,
  queryClient,
  transport,
}: {
  formState: CreateInstanceFormState;
  mutateAsync: ReturnType<typeof useCreateInstanceMutation>["mutateAsync"];
  navigate: ReturnType<typeof useNavigate>;
  queryClient: ReturnType<typeof useQueryClient>;
  transport: ReturnType<typeof useTransport>;
}) {
  try {
    const response = await mutateAsync(
      buildCreateInstanceRequest(formState, false)
    );
    const fallbackDatabases = [{ name: formState.database }];
    const databases = await settleImmediate(
      fetchCreatedInstanceDatabases({
        instanceId: parseResourceLeafId(response.instance?.name ?? ""),
        queryClient,
        transport,
      }),
      fallbackDatabases
    );
    return successOutcome(
      await navigateAfterCreate({
        navigate,
        target: resolveCreateInstanceSuccessTarget({
          createdInstanceName: response.instance?.name,
          databases,
          preferredDatabaseId: formState.database,
        }),
      })
    );
  } catch (error) {
    return errorOutcome(error);
  }
}

export type { CreateInstanceSubmissionOutcome };
export { createInstanceAndNavigate, testInstanceConnection };
