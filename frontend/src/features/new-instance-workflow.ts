import { create as createProto } from "@bufbuild/protobuf";
import { parseResourceLeafId } from "@/lib/console-resources";
import {
  buildTestInstanceConnectionRequest,
  getPostgresConfigFingerprint,
} from "@/lib/instance-connection";
import { anyPredicate } from "@/lib/predicates";
import {
  SSL_MODE_OPTIONS,
  SSL_NEGOTIATION_OPTIONS,
  type SslModeOptionValue,
  type SslNegotiationOptionValue,
} from "@/lib/ssl-modes";
import {
  CreateInstanceSpecSchema,
  PostgresConfig_SslMode,
  PostgresConfig_SslNegotiation,
  PostgresConfigSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import {
  type CreateInstanceFieldName,
  type CreateInstanceFormErrors,
  type CreateInstanceInvalidFieldName,
  validateCreateInstanceForm,
} from "@/routes/new-instance-validation";

const DEFAULT_POSTGRES_PORT = "5432";
const MIN_POSTGRES_PORT = 1;
const MAX_POSTGRES_PORT = 65_535;
const POSTGRES_PORT_PATTERN = /^\d+$/;

interface InlineNotice {
  message: string;
  variant: "error" | "success";
}

interface CreateInstanceLabel {
  id: string;
  key: string;
  value: string;
}

interface CreateInstanceFormState {
  database: string;
  displayName: string;
  host: string;
  instanceId: string;
  labels: CreateInstanceLabel[];
  password: string;
  port: string;
  sslMode: SslModeOptionValue;
  sslNegotiation: SslNegotiationOptionValue;
  username: string;
}

function isConnectionField(field: CreateInstanceFieldName) {
  return [
    "database",
    "host",
    "password",
    "port",
    "sslMode",
    "sslNegotiation",
    "username",
  ].includes(field);
}

interface CreateInstanceWorkflowState {
  firstInvalidField: CreateInstanceInvalidFieldName | null;
  formErrors: CreateInstanceFormErrors;
  formNotice: InlineNotice | null;
  formState: CreateInstanceFormState;
  isTesting: boolean;
  lastSuccessfulConnectionFingerprint: string | null;
  showAdvanced: boolean;
  testResult: InlineNotice | null;
  validationAttempt: number;
}

type CreateInstanceWorkflowAction =
  | { field: CreateInstanceFieldName; type: "updateField"; value: string }
  | { labels: CreateInstanceLabel[]; type: "setLabels" }
  | { notice: InlineNotice | null; type: "setFormNotice" }
  | { type: "setIsTesting"; value: boolean }
  | { type: "toggleAdvanced" }
  | { result: InlineNotice | null; type: "setTestResult" }
  | {
      firstInvalidField: CreateInstanceInvalidFieldName | null;
      formErrors: CreateInstanceFormErrors;
      type: "setFormErrors";
    }
  | {
      fingerprint: string | null;
      type: "setLastSuccessfulConnectionFingerprint";
    };

function createEmptyFormState(): CreateInstanceFormState {
  return {
    database: "postgres",
    displayName: "",
    host: "",
    instanceId: "",
    labels: [],
    password: "",
    port: DEFAULT_POSTGRES_PORT,
    sslMode: "prefer",
    sslNegotiation: "postgres",
    username: "postgres",
  };
}

type CreateInstanceWorkflowInitialState = Partial<
  Omit<CreateInstanceWorkflowState, "formState">
> & { formState?: Partial<CreateInstanceFormState> };

function createCreateInstanceWorkflowState(
  initialState?: CreateInstanceWorkflowInitialState
): CreateInstanceWorkflowState {
  const emptyState = {
    firstInvalidField: null,
    formErrors: {},
    formNotice: null,
    formState: createEmptyFormState(),
    isTesting: false,
    lastSuccessfulConnectionFingerprint: null,
    showAdvanced: false,
    testResult: null,
    validationAttempt: 0,
  } satisfies CreateInstanceWorkflowState;
  return initialState
    ? {
        ...emptyState,
        ...initialState,
        formState: { ...emptyState.formState, ...initialState.formState },
      }
    : emptyState;
}

function updateWorkflowField(
  state: CreateInstanceWorkflowState,
  action: Extract<CreateInstanceWorkflowAction, { type: "updateField" }>
): CreateInstanceWorkflowState {
  const { [action.field]: _clearedError, ...remainingErrors } =
    state.formErrors;
  const connectionFieldChanged = isConnectionField(action.field);
  return {
    ...state,
    firstInvalidField:
      state.firstInvalidField === action.field ? null : state.firstInvalidField,
    formErrors: remainingErrors,
    formNotice: null,
    formState: {
      ...state.formState,
      [action.field]: normalizeCreateInstanceFieldValue(
        action.field,
        action.value
      ),
    },
    lastSuccessfulConnectionFingerprint: connectionFieldChanged
      ? null
      : state.lastSuccessfulConnectionFingerprint,
    testResult: connectionFieldChanged ? null : state.testResult,
  };
}

function createInstanceWorkflowReducer(
  state: CreateInstanceWorkflowState,
  action: CreateInstanceWorkflowAction
): CreateInstanceWorkflowState {
  switch (action.type) {
    case "setFormErrors":
      return {
        ...state,
        firstInvalidField: action.firstInvalidField,
        formErrors: action.formErrors,
        // Instance ID errors only come from the server, so always surface
        // them; labels expand only when they are the field to focus.
        showAdvanced: anyPredicate(
          () => action.firstInvalidField === "labels",
          () => action.formErrors.instanceId
        )
          ? true
          : state.showAdvanced,
        validationAttempt: state.validationAttempt + 1,
      };
    case "setFormNotice":
      return { ...state, formNotice: action.notice };
    case "setIsTesting":
      return { ...state, isTesting: action.value };
    case "setLabels": {
      const { labels: _labelsError, ...remainingErrors } = state.formErrors;
      return {
        ...state,
        firstInvalidField:
          state.firstInvalidField === "labels" ? null : state.firstInvalidField,
        formErrors: remainingErrors,
        formState: { ...state.formState, labels: action.labels },
      };
    }
    case "setTestResult":
      return { ...state, testResult: action.result };
    case "setLastSuccessfulConnectionFingerprint":
      return {
        ...state,
        lastSuccessfulConnectionFingerprint: action.fingerprint,
      };
    case "toggleAdvanced":
      return { ...state, showAdvanced: !state.showAdvanced };
    case "updateField":
      return updateWorkflowField(state, action);
    default:
      return state;
  }
}

function normalizeSslMode(value: string): SslModeOptionValue {
  return (
    SSL_MODE_OPTIONS.find((option) => option.value === value)?.value ?? "prefer"
  );
}

function normalizeSslNegotiation(value: string): SslNegotiationOptionValue {
  return (
    SSL_NEGOTIATION_OPTIONS.find((option) => option.value === value)?.value ??
    "postgres"
  );
}

function normalizeCreateInstanceFieldValue(
  field: CreateInstanceFieldName,
  value: string
) {
  switch (field) {
    case "sslMode":
      return normalizeSslMode(value);
    case "sslNegotiation":
      return normalizeSslNegotiation(value);
    default:
      return value;
  }
}

function toSslMode(value: SslModeOptionValue): PostgresConfig_SslMode {
  switch (value) {
    case "disable":
      return PostgresConfig_SslMode.DISABLED;
    case "allow":
      return PostgresConfig_SslMode.ALLOW;
    case "require":
      return PostgresConfig_SslMode.REQUIRE;
    case "verify-ca":
      return PostgresConfig_SslMode.VERIFY_CA;
    case "verify-full":
      return PostgresConfig_SslMode.VERIFY_FULL;
    case "prefer":
      return PostgresConfig_SslMode.PREFER;
    default:
      return PostgresConfig_SslMode.PREFER;
  }
}

function toSslNegotiation(
  value: SslNegotiationOptionValue
): PostgresConfig_SslNegotiation {
  switch (value) {
    case "direct":
      return PostgresConfig_SslNegotiation.DIRECT;
    case "postgres":
      return PostgresConfig_SslNegotiation.POSTGRES;
    default:
      return PostgresConfig_SslNegotiation.POSTGRES;
  }
}

function parseStrictPostgresPort(rawPort: string) {
  const normalizedPort = rawPort.trim();
  const port = Number.parseInt(normalizedPort, 10);
  if (
    !(POSTGRES_PORT_PATTERN.test(normalizedPort) && Number.isInteger(port)) ||
    port < MIN_POSTGRES_PORT ||
    port > MAX_POSTGRES_PORT
  ) {
    throw new Error(
      `Port must be between ${MIN_POSTGRES_PORT} and ${MAX_POSTGRES_PORT}.`
    );
  }
  return port;
}

function buildPostgresConfig(formState: CreateInstanceFormState) {
  return createProto(PostgresConfigSchema, {
    database: formState.database.trim(),
    host: formState.host.trim(),
    password: formState.password,
    port: parseStrictPostgresPort(formState.port),
    sslMode: toSslMode(formState.sslMode),
    sslNegotiation: toSslNegotiation(formState.sslNegotiation),
    username: formState.username.trim(),
  });
}

function buildCreateInstanceRequest(
  formState: CreateInstanceFormState,
  validateOnly = false
) {
  const labels: Record<string, string> = {};
  for (const label of formState.labels) {
    if (label.key.trim()) {
      labels[label.key.trim()] = label.value;
    }
  }
  const instanceId = formState.instanceId.trim();
  return {
    ...(instanceId ? { instanceId } : {}),
    spec: createProto(CreateInstanceSpecSchema, {
      config: buildPostgresConfig(formState),
      displayName: formState.displayName.trim(),
      labels,
    }),
    validateOnly,
  };
}

function buildTestConnectionRequest(formState: CreateInstanceFormState) {
  return buildTestInstanceConnectionRequest(buildPostgresConfig(formState));
}

function getConnectionFingerprint(formState: CreateInstanceFormState) {
  return getPostgresConfigFingerprint(buildPostgresConfig(formState));
}

function canCreateInstance(state: CreateInstanceWorkflowState) {
  if (!state.lastSuccessfulConnectionFingerprint) {
    return false;
  }

  try {
    return (
      state.lastSuccessfulConnectionFingerprint ===
      getConnectionFingerprint(state.formState)
    );
  } catch {
    return false;
  }
}

function validateWorkflowSubmit(state: CreateInstanceWorkflowState) {
  return validateCreateInstanceForm(state.formState);
}

function getCreateInstanceNavigationTarget(instanceName?: string) {
  const instanceId = parseResourceLeafId(instanceName ?? "");
  return instanceId
    ? ({
        params: { instanceId },
        search: {},
        to: "/instances/$instanceId",
      } as const)
    : ({ replace: true, to: "/" } as const);
}

function createInstanceLabel(): CreateInstanceLabel {
  return { id: crypto.randomUUID(), key: "", value: "" };
}

export type {
  CreateInstanceFormState,
  CreateInstanceLabel,
  CreateInstanceWorkflowState,
  InlineNotice,
};
export {
  buildCreateInstanceRequest,
  buildTestConnectionRequest,
  canCreateInstance,
  createCreateInstanceWorkflowState,
  createInstanceLabel,
  createInstanceWorkflowReducer,
  getConnectionFingerprint,
  getCreateInstanceNavigationTarget,
  validateWorkflowSubmit,
};
