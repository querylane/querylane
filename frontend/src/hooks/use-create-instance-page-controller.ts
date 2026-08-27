import { useTransport } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useWatch } from "react-hook-form";
import { extractCreateInstanceFieldViolations } from "@/features/create-instance-field-violations";
import {
  clearCreateInstanceProtoError,
  createCreateInstanceDefaultValues,
  getCreateInstanceProtoErrors,
  labelsToMap,
  readCreateInstanceFormState,
  setCreateInstanceProtoField,
  validateCreateInstanceProtoForm,
} from "@/features/new-instance-protoform";
import {
  createInstanceAndNavigate,
  testInstanceConnection,
} from "@/features/new-instance-submission";
import {
  type CreateInstanceLabel,
  type CreateInstanceWorkflowState,
  canCreateInstance,
  createCreateInstanceWorkflowState,
  getConnectionFingerprint,
  type InlineNotice,
} from "@/features/new-instance-workflow";
import {
  useCreateInstanceMutation,
  useTestInstanceConnectionMutation,
} from "@/hooks/api/instance";
import { useProtoForm } from "@/hooks/use-proto-form";
import { handleNavigationError } from "@/lib/navigation-errors";
import { normalizeAppUiError } from "@/lib/ui-error";
import { CreateInstanceSpecSchema } from "@/protogen/querylane/console/v1alpha1/instance_pb";
import { focusFirstCreateInstanceInvalidField } from "@/routes/new-instance-focus";
import type {
  CreateInstanceFieldName,
  CreateInstanceFormErrors,
  CreateInstanceInvalidFieldName,
} from "@/routes/new-instance-validation";

const CONNECTION_FIELDS = new Set<CreateInstanceFieldName>([
  "database",
  "host",
  "password",
  "port",
  "sslMode",
  "sslNegotiation",
  "username",
]);

function createInitialWorkflow(
  initialState: Partial<CreateInstanceWorkflowState> | undefined
) {
  const emptyState = createCreateInstanceWorkflowState();
  return initialState
    ? {
        ...emptyState,
        ...initialState,
        formState: {
          ...emptyState.formState,
          ...initialState.formState,
        },
      }
    : emptyState;
}

function withoutFieldError(
  errors: CreateInstanceFormErrors,
  field: CreateInstanceInvalidFieldName
) {
  const { [field]: _removed, ...remaining } = errors;
  return remaining;
}

function getSupplementalServerErrors(
  fieldErrors: CreateInstanceFormErrors
): CreateInstanceFormErrors {
  const errors: CreateInstanceFormErrors = {};
  if (fieldErrors.instanceId) {
    errors.instanceId = fieldErrors.instanceId;
  }
  if (fieldErrors.labels) {
    errors.labels = fieldErrors.labels;
  }
  return errors;
}

function hasSupplementalServerError(errors: CreateInstanceFormErrors) {
  return Boolean(errors.instanceId || errors.labels);
}

function createServerNotice({
  action,
  error,
  generalErrors,
  handled,
}: {
  action: "create instance" | "test instance connection";
  error: unknown;
  generalErrors: string[];
  handled: boolean;
}): InlineNotice | null {
  if (generalErrors.length > 0) {
    return { message: generalErrors.join(" "), variant: "error" };
  }
  if (handled) {
    return null;
  }
  const uiError = normalizeAppUiError(error, {
    action,
    area: "create-instance",
    source: "mutation",
    surface: "inline",
  });
  return { message: uiError.message, variant: "error" };
}

export function useCreateInstancePageController(
  initialState?: Partial<CreateInstanceWorkflowState> | undefined
) {
  const navigate = useNavigate({ from: "/new-instance" });
  const queryClient = useQueryClient();
  const transport = useTransport();
  const createInstanceMutation = useCreateInstanceMutation();
  const testInstanceConnectionMutation = useTestInstanceConnectionMutation();
  const initialValuesRef = useRef<{
    formDefaults: ReturnType<typeof createCreateInstanceDefaultValues>;
    workflow: CreateInstanceWorkflowState;
  } | null>(null);
  if (initialValuesRef.current === null) {
    const workflow = createInitialWorkflow(initialState);
    initialValuesRef.current = {
      formDefaults: createCreateInstanceDefaultValues(workflow.formState),
      workflow,
    };
  }
  const { formDefaults, workflow: initialWorkflow } = initialValuesRef.current;
  const form = useProtoForm(CreateInstanceSpecSchema, {
    defaultValues: formDefaults,
    mode: "onChange",
    serverPathPrefixes: ["spec", "instance"],
  });
  useWatch({ control: form.control });

  const [instanceId, setInstanceId] = useState(
    initialWorkflow.formState.instanceId
  );
  // allow: proto-form-parallel-state map rows need stable IDs while blank keys
  // cannot be represented by a protobuf map; every valid row is synced below.
  const [labels, setLabels] = useState(initialWorkflow.formState.labels);
  const [showAdvanced, setShowAdvanced] = useState(
    initialWorkflow.showAdvanced
  );
  const [testResult, setTestResult] = useState(initialWorkflow.testResult);
  const [formNotice, setFormNotice] = useState(initialWorkflow.formNotice);
  const [supplementalErrors, setSupplementalErrors] =
    useState<CreateInstanceFormErrors>(initialWorkflow.formErrors);
  const [firstInvalidField, setFirstInvalidField] =
    useState<CreateInstanceInvalidFieldName | null>(
      initialWorkflow.firstInvalidField
    );
  const [isTesting, setIsTesting] = useState(initialWorkflow.isTesting);
  const [
    lastSuccessfulConnectionFingerprint,
    setLastSuccessfulConnectionFingerprint,
  ] = useState(initialWorkflow.lastSuccessfulConnectionFingerprint);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  const formState = readCreateInstanceFormState({
    form,
    instanceId,
    labels,
  });
  const formErrors = getCreateInstanceProtoErrors(form, supplementalErrors);
  const workflowState = {
    ...initialWorkflow,
    formErrors,
    formState,
    lastSuccessfulConnectionFingerprint,
  };
  const canCreate = canCreateInstance(workflowState);

  const resetConnectionVerification = () => {
    setLastSuccessfulConnectionFingerprint(null);
    setTestResult(null);
  };
  const updateField = (field: CreateInstanceFieldName, value: string) => {
    setSupplementalErrors((current) => withoutFieldError(current, field));
    clearCreateInstanceProtoError(form, field);
    setFirstInvalidField((current) => (current === field ? null : current));
    setFormNotice(null);
    if (field === "instanceId") {
      setInstanceId(value);
    } else {
      setCreateInstanceProtoField(form, field, value);
    }
    if (CONNECTION_FIELDS.has(field)) {
      resetConnectionVerification();
    }
  };
  const updateLabels = (nextLabels: CreateInstanceLabel[]) => {
    setLabels(nextLabels);
    form.setValue("labels", labelsToMap(nextLabels), {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: false,
    });
    setSupplementalErrors((current) => withoutFieldError(current, "labels"));
    setFirstInvalidField((current) => (current === "labels" ? null : current));
  };
  const validate = async () => {
    const validation = await validateCreateInstanceProtoForm(form, formState);
    setSupplementalErrors(validation.errors);
    setFirstInvalidField(validation.firstInvalidField);
    if (validation.firstInvalidField) {
      if (
        validation.firstInvalidField === "instanceId" ||
        validation.firstInvalidField === "labels"
      ) {
        setShowAdvanced(true);
      }
      focusFirstCreateInstanceInvalidField();
      return false;
    }
    return true;
  };
  const applyServerError = (
    error: unknown,
    action: "create instance" | "test instance connection"
  ) => {
    const protoOutcome = form.setServerErrors(error);
    const legacyOutcome = extractCreateInstanceFieldViolations(error);
    const extraErrors = getSupplementalServerErrors(legacyOutcome.fieldErrors);
    const hasExtraErrors = hasSupplementalServerError(extraErrors);
    setSupplementalErrors(extraErrors);
    setFirstInvalidField(legacyOutcome.firstInvalidField);
    if (hasExtraErrors) {
      setShowAdvanced(true);
    }
    if (legacyOutcome.firstInvalidField) {
      focusFirstCreateInstanceInvalidField();
    }
    return createServerNotice({
      action,
      error,
      generalErrors: legacyOutcome.generalErrors,
      handled: protoOutcome.handled || hasExtraErrors,
    });
  };
  const handleBack = () => {
    navigate({ to: "/" }).catch((error: unknown) =>
      handleNavigationError(error, {
        area: "new-instance.back",
      })
    );
  };
  const handleTestConnection = async () => {
    if (!(await validate())) {
      return;
    }
    form.clearServerErrorContext();
    setFormNotice(null);
    setTestResult(null);
    setIsTesting(true);
    try {
      const outcome = await testInstanceConnection({
        formState,
        mutateAsync: testInstanceConnectionMutation.mutateAsync,
      });
      if (outcome.error) {
        setTestResult(
          applyServerError(outcome.error, "test instance connection")
        );
        setLastSuccessfulConnectionFingerprint(null);
        return;
      }
      setTestResult(outcome.notice);
      setLastSuccessfulConnectionFingerprint(
        getConnectionFingerprint(formState)
      );
    } finally {
      setIsTesting(false);
    }
  };
  const handleCreate = async () => {
    if (isSubmittingRef.current || !(await validate()) || !canCreate) {
      return;
    }
    form.clearServerErrorContext();
    setFormNotice(null);
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      const outcome = await createInstanceAndNavigate({
        formState,
        mutateAsync: createInstanceMutation.mutateAsync,
        navigate,
        queryClient,
        transport,
      });
      setFormNotice(
        outcome.error
          ? applyServerError(outcome.error, "create instance")
          : outcome.notice
      );
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return {
    canCreate,
    firstInvalidField,
    formErrors,
    formNotice,
    formState,
    handleBack,
    handleCreate,
    handleTestConnection,
    isPending: (createInstanceMutation.isPending || isSubmitting) && !isTesting,
    isTesting,
    setLabels: updateLabels,
    showAdvanced,
    testResult,
    toggleAdvanced: () => setShowAdvanced((current) => !current),
    updateField,
  };
}
