import { useTransport } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useReducer, useRef, useState } from "react";
import { extractCreateInstanceFieldViolations } from "@/features/create-instance-field-violations";
import {
  buildCreateInstanceRequest,
  buildTestConnectionRequest,
  type CreateInstanceFormState,
  type CreateInstanceLabel,
  type CreateInstanceWorkflowState,
  canCreateInstance,
  createCreateInstanceWorkflowState,
  createInstanceWorkflowReducer,
  getConnectionFingerprint,
  type InlineNotice,
  validateWorkflowSubmit,
} from "@/features/new-instance-workflow";
import {
  databasesForInstanceQueryInput,
  listAllDatabasesQueryOptions,
} from "@/hooks/api/database";
import {
  useCreateInstanceMutation,
  useTestInstanceConnectionMutation,
} from "@/hooks/api/instance";
import { parseResourceLeafId } from "@/lib/console-resources";
import { resolveCreateInstanceSuccessTarget } from "@/lib/create-instance-navigation";
import { logger } from "@/lib/diagnostics";
import {
  handleNavigationError,
  isNavigationCancellationError,
} from "@/lib/navigation-errors";
import { normalizeAppUiError } from "@/lib/ui-error";
import { focusFirstCreateInstanceInvalidField } from "@/routes/new-instance-focus";
import type {
  CreateInstanceFieldName,
  CreateInstanceFormErrors,
  CreateInstanceInvalidFieldName,
} from "@/routes/new-instance-validation";

interface CreateInstanceSubmitOutcome {
  fieldErrors: CreateInstanceFormErrors | null;
  firstInvalidField: CreateInstanceInvalidFieldName | null;
  notice: InlineNotice | null;
}

function createInstanceSubmitNoticeOutcome(
  notice: InlineNotice | null
): CreateInstanceSubmitOutcome {
  return {
    fieldErrors: null,
    firstInvalidField: null,
    notice,
  };
}

const CREATE_INSTANCE_DISCOVERY_GRACE_MS = 50;

async function testInstanceConnection({
  formState,
  mutateAsync,
}: {
  formState: CreateInstanceFormState;
  mutateAsync: ReturnType<
    typeof useTestInstanceConnectionMutation
  >["mutateAsync"];
}): Promise<CreateInstanceSubmitOutcome> {
  try {
    await mutateAsync(buildTestConnectionRequest(formState));
    return createInstanceSubmitNoticeOutcome({
      message: "Connection successful.",
      variant: "success",
    });
  } catch (error) {
    const { fieldErrors, firstInvalidField, generalErrors } =
      extractCreateInstanceFieldViolations(error);
    if (firstInvalidField || generalErrors.length > 0) {
      return {
        fieldErrors,
        firstInvalidField,
        notice:
          generalErrors.length > 0
            ? { message: generalErrors.join(" "), variant: "error" }
            : null,
      };
    }
    const uiError = normalizeAppUiError(error, {
      action: "test instance connection",
      area: "create-instance",
      source: "mutation",
      surface: "inline",
    });
    return createInstanceSubmitNoticeOutcome({
      message: uiError.message,
      variant: "error",
    });
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
  if (!instanceId) {
    return [];
  }

  try {
    const response = await queryClient.fetchQuery({
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

function settleImmediate<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), CREATE_INSTANCE_DISCOVERY_GRACE_MS);
    }),
  ]);
}

async function navigateAfterCreate({
  navigate,
  target,
}: {
  navigate: ReturnType<typeof useNavigate>;
  target: ReturnType<typeof resolveCreateInstanceSuccessTarget>;
}): Promise<InlineNotice | null> {
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
    };
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
}): Promise<CreateInstanceSubmitOutcome> {
  try {
    const response = await mutateAsync(
      buildCreateInstanceRequest(formState, false)
    );
    const fallbackDatabases = [
      {
        name: formState.database,
      },
    ];
    const databases = await settleImmediate(
      fetchCreatedInstanceDatabases({
        instanceId: parseResourceLeafId(response.instance?.name ?? ""),
        queryClient,
        transport,
      }),
      fallbackDatabases
    );
    return createInstanceSubmitNoticeOutcome(
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
    const { fieldErrors, firstInvalidField, generalErrors } =
      extractCreateInstanceFieldViolations(error);
    if (firstInvalidField || generalErrors.length > 0) {
      return {
        fieldErrors,
        firstInvalidField,
        notice:
          generalErrors.length > 0
            ? { message: generalErrors.join(" "), variant: "error" }
            : null,
      };
    }
    const uiError = normalizeAppUiError(error, {
      action: "create instance",
      area: "create-instance",
      source: "mutation",
      surface: "inline",
    });
    return createInstanceSubmitNoticeOutcome({
      message: uiError.message,
      variant: "error",
    });
  }
}
export function useCreateInstancePageController(
  initialState?: Partial<CreateInstanceWorkflowState> | undefined
) {
  const navigate = useNavigate({ from: "/new-instance" });
  const queryClient = useQueryClient();
  const transport = useTransport();
  const createInstanceMutation = useCreateInstanceMutation();
  const testInstanceConnectionMutation = useTestInstanceConnectionMutation();
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [state, dispatch] = useReducer(
    createInstanceWorkflowReducer,
    initialState,
    (state) => {
      const emptyState = createCreateInstanceWorkflowState();
      return state
        ? {
            ...emptyState,
            ...state,
            formState: {
              ...emptyState.formState,
              ...state.formState,
            },
          }
        : emptyState;
    }
  );
  const updateField = (field: CreateInstanceFieldName, value: string) => {
    dispatch({
      field,
      type: "updateField",
      value,
    });
  };
  const setLabels = (labels: CreateInstanceLabel[]) => {
    dispatch({
      labels,
      type: "setLabels",
    });
  };
  const toggleAdvanced = () => {
    dispatch({
      type: "toggleAdvanced",
    });
  };
  const handleBack = () => {
    navigate({
      to: "/",
    }).catch((error: unknown) =>
      handleNavigationError(error, { area: "new-instance.back" })
    );
  };
  const handleTestConnection = async () => {
    const validation = validateWorkflowSubmit(state);
    if (validation.firstInvalidField) {
      dispatch({
        firstInvalidField: validation.firstInvalidField,
        formErrors: validation.errors,
        type: "setFormErrors",
      });
      focusFirstCreateInstanceInvalidField();
      return;
    }
    dispatch({
      notice: null,
      type: "setFormNotice",
    });
    dispatch({
      result: null,
      type: "setTestResult",
    });
    dispatch({
      type: "setIsTesting",
      value: true,
    });
    const outcome = await testInstanceConnection({
      formState: state.formState,
      mutateAsync: testInstanceConnectionMutation.mutateAsync,
    });
    dispatch({
      type: "setIsTesting",
      value: false,
    });
    if (outcome.fieldErrors && outcome.firstInvalidField) {
      dispatch({
        firstInvalidField: outcome.firstInvalidField,
        formErrors: outcome.fieldErrors,
        type: "setFormErrors",
      });
      focusFirstCreateInstanceInvalidField();
    }
    dispatch({
      result: outcome.notice,
      type: "setTestResult",
    });
    dispatch({
      fingerprint:
        outcome.notice?.variant === "success"
          ? getConnectionFingerprint(state.formState)
          : null,
      type: "setLastSuccessfulConnectionFingerprint",
    });
  };
  const handleCreate = async () => {
    if (isSubmittingRef.current) {
      return;
    }

    const validation = validateWorkflowSubmit(state);
    if (validation.firstInvalidField) {
      dispatch({
        firstInvalidField: validation.firstInvalidField,
        formErrors: validation.errors,
        type: "setFormErrors",
      });
      focusFirstCreateInstanceInvalidField();
      return;
    }
    if (!canCreateInstance(state)) {
      return;
    }
    dispatch({
      notice: null,
      type: "setFormNotice",
    });
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    const outcome = await createInstanceAndNavigate({
      formState: state.formState,
      mutateAsync: createInstanceMutation.mutateAsync,
      navigate,
      queryClient,
      transport,
    });
    if (outcome.fieldErrors && outcome.firstInvalidField) {
      dispatch({
        firstInvalidField: outcome.firstInvalidField,
        formErrors: outcome.fieldErrors,
        type: "setFormErrors",
      });
      focusFirstCreateInstanceInvalidField();
    }
    if (outcome.notice) {
      dispatch({
        notice: outcome.notice,
        type: "setFormNotice",
      });
    }
    isSubmittingRef.current = false;
    setIsSubmitting(false);
  };
  return {
    canCreate: canCreateInstance(state),
    firstInvalidField: state.firstInvalidField,
    formErrors: state.formErrors,
    formNotice: state.formNotice,
    formState: state.formState,
    handleBack,
    handleCreate,
    handleTestConnection,
    isPending:
      (createInstanceMutation.isPending || isSubmitting) && !state.isTesting,
    isTesting: state.isTesting,
    setLabels,
    showAdvanced: state.showAdvanced,
    testResult: state.testResult,
    toggleAdvanced,
    updateField,
    validationAttempt: state.validationAttempt,
  };
}
