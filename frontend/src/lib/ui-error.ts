import { Code, ConnectError } from "@connectrpc/connect";
import { toast } from "sonner";

import { captureException, logger } from "@/lib/observability/sentry";
import { normalizeConnectErrorState } from "@/lib/ui-error-connect";
import { buildReproduction } from "@/lib/ui-error-reproduction";
import {
  buildTechnicalDetailsObject,
  buildTechnicalDetailsText,
  resolveUnderlyingCause,
} from "@/lib/ui-error-sections";
import type {
  AppErrorSource,
  AppUiError,
  AppUiErrorContext,
  AppUiErrorPostgres,
  BlockingErrorReason,
  ReportAppUiErrorDependencies,
} from "@/lib/ui-error-types";

const APP_UI_ERROR_CONTEXT = Symbol.for("querylane.app-ui-error-context");
const APP_UI_ERROR_REPORTED = Symbol.for("querylane.app-ui-error-reported");
type PostgresUiErrorKind =
  | "authentication_failed"
  | "constraint_violation"
  | "failed_precondition"
  | "generic"
  | "internal"
  | "invalid"
  | "not_found"
  | "permission_denied"
  | "resource_exhausted"
  | "retryable"
  | "timeout"
  | "unsupported"
  | "unavailable";

const POSTGRES_TITLES: Record<PostgresUiErrorKind, string> = {
  authentication_failed: "PostgreSQL authentication failed",
  constraint_violation: "PostgreSQL constraint violation",
  failed_precondition: "PostgreSQL precondition failed",
  generic: "PostgreSQL error",
  internal: "PostgreSQL internal error",
  invalid: "PostgreSQL request rejected",
  not_found: "PostgreSQL resource not found",
  permission_denied: "PostgreSQL permission denied",
  resource_exhausted: "PostgreSQL resources exhausted",
  retryable: "PostgreSQL transaction needs retry",
  timeout: "PostgreSQL query timed out",
  unavailable: "PostgreSQL unavailable",
  unsupported: "PostgreSQL feature not supported",
};

const POSTGRES_RETRY_GUIDANCE: Record<PostgresUiErrorKind, string> = {
  authentication_failed:
    "Retry after checking the database credentials or authentication configuration.",
  constraint_violation: "Fix the constraint violation before retrying.",
  failed_precondition:
    "Fix the PostgreSQL state or request precondition before retrying.",
  generic: "Retry after checking the PostgreSQL condition.",
  internal: "Retry later. If it continues, share the technical details.",
  invalid: "Fix the SQL or request fields before retrying.",
  not_found: "Refresh metadata or choose an existing PostgreSQL resource.",
  permission_denied: "Retry after checking the role or grants.",
  resource_exhausted:
    "Retry after reducing load or increasing PostgreSQL resources.",
  retryable:
    "Retry the request. PostgreSQL canceled this attempt to protect consistency.",
  timeout: "Retry after the query finishes or reduce the work requested.",
  unavailable: "Retry after the PostgreSQL server is available.",
  unsupported:
    "Use a PostgreSQL-supported feature or adjust the request before retrying.",
};

const POSTGRES_TIMEOUT_SQLSTATES = new Set(["25P04", "57014"]);
const POSTGRES_NOT_FOUND_SQLSTATES = new Set(["3D000", "3F000"]);
const POSTGRES_AMBIGUOUS_NOT_FOUND_SQLSTATES = new Set(["42703", "42P01"]);
const POSTGRES_NOT_FOUND_CONDITIONS = new Set([
  "invalid_catalog_name",
  "invalid_schema_name",
]);
const POSTGRES_AMBIGUOUS_NOT_FOUND_CONDITIONS = new Set([
  "undefined_column",
  "undefined_table",
]);
const POSTGRES_RESOURCE_EXHAUSTED_CLASSES = new Set(["53", "54"]);
const POSTGRES_RESOURCE_EXHAUSTED_CONDITIONS = new Set([
  "insufficient_resources",
  "program_limit_exceeded",
  "too_many_connections",
]);
const POSTGRES_AUTHENTICATION_CONDITIONS = new Set([
  "invalid_authorization_specification",
  "invalid_password",
]);
const POSTGRES_RETRYABLE_CONDITIONS = new Set([
  "deadlock_detected",
  "lock_not_available",
  "serialization_failure",
  "transaction_rollback",
]);
const POSTGRES_UNAVAILABLE_CONDITIONS = new Set([
  "cannot_connect_now",
  "connection_exception",
  "connection_failure",
  "fdw_error",
  "foreign_data_wrapper_error",
  "operator_intervention",
]);
const POSTGRES_CONSTRAINT_CONDITIONS = new Set([
  "check_violation",
  "exclusion_violation",
  "foreign_key_violation",
  "integrity_constraint_violation",
  "not_null_violation",
  "restrict_violation",
  "unique_violation",
]);
const POSTGRES_FAILED_PRECONDITION_CONDITIONS = new Set([
  "invalid_transaction_state",
  "object_not_in_prerequisite_state",
  "plpgsql_error",
  "read_only_sql_transaction",
]);
const POSTGRES_INVALID_CONDITIONS = new Set([
  "ambiguous_column",
  "cardinality_violation",
  "data_exception",
  "datatype_mismatch",
  "division_by_zero",
  "duplicate_alias",
  "indeterminate_datatype",
  "invalid_argument_for_xquery",
  "invalid_text_representation",
  "syntax_error",
  "syntax_error_or_access_rule_violation",
  "undefined_function",
  "undefined_parameter",
]);
const POSTGRES_INTERNAL_CONDITIONS = new Set([
  "internal_error",
  "system_error",
]);
const POSTGRES_FAILED_PRECONDITION_CLASSES = new Set(["25", "55", "P0"]);
const POSTGRES_INVALID_CLASSES = new Set(["21", "22", "42"]);
const POSTGRES_INTERNAL_CLASSES = new Set(["58", "XX"]);
const POSTGRES_UNAVAILABLE_CLASSES = new Set(["08", "57", "HV"]);

const defaultReportAppUiErrorDependencies: ReportAppUiErrorDependencies = {
  captureException,
  logger,
  toast,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readAttachedContext(error: unknown): AppUiErrorContext {
  if (!(typeof error === "object" && error !== null)) {
    return {};
  }

  const attached = (error as Record<PropertyKey, unknown>)[
    APP_UI_ERROR_CONTEXT
  ];
  return isRecord(attached) ? (attached as AppUiErrorContext) : {};
}

function attachAppUiErrorContext(
  error: unknown,
  context: AppUiErrorContext
): void {
  if (!(typeof error === "object" && error !== null)) {
    return;
  }

  const existing = readAttachedContext(error);
  (error as Record<PropertyKey, unknown>)[APP_UI_ERROR_CONTEXT] = {
    ...existing,
    ...context,
  };
}

function classifyBlockingReason({
  code,
  postgres,
  reason,
}: {
  code: Code | null;
  postgres: AppUiErrorPostgres | null;
  reason: string | null;
}): BlockingErrorReason | null {
  if (
    reason === "APP_DATABASE_NOT_CONFIGURED" ||
    reason === "ERROR_REASON_APP_DATABASE_NOT_CONFIGURED"
  ) {
    return "setup_required";
  }

  if (
    postgres === null &&
    (reason === "UNAUTHENTICATED" ||
      reason === "ERROR_REASON_UNAUTHENTICATED" ||
      code === Code.Unauthenticated)
  ) {
    return "unauthenticated";
  }

  if (
    postgres === null &&
    (reason === "PERMISSION_DENIED" ||
      reason === "ERROR_REASON_PERMISSION_DENIED" ||
      code === Code.PermissionDenied)
  ) {
    return "permission_denied";
  }

  return null;
}

function isAppDatabaseUnavailableReason(reason: string | null): boolean {
  return (
    reason === "APP_DATABASE_UNAVAILABLE" ||
    reason === "ERROR_REASON_APP_DATABASE_UNAVAILABLE"
  );
}

function buildTitle({
  blockingReason,
  code,
  postgresKind,
  reason,
}: {
  blockingReason: BlockingErrorReason | null;
  code: Code | null;
  postgresKind: PostgresUiErrorKind | null;
  reason: string | null;
}): string {
  if (blockingReason === "setup_required") {
    return "Setup required";
  }

  if (blockingReason === "unauthenticated") {
    return "Authentication required";
  }

  if (blockingReason === "permission_denied") {
    return "Access denied";
  }

  if (isAppDatabaseUnavailableReason(reason)) {
    return "Meta database unavailable";
  }

  if (postgresKind) {
    return POSTGRES_TITLES[postgresKind];
  }

  if (code === Code.DeadlineExceeded) {
    return "Request timed out";
  }

  if (code === Code.Unavailable) {
    return "Can't reach the server";
  }

  if (code === Code.InvalidArgument) {
    return "Request rejected";
  }

  if (code === Code.NotFound) {
    return "Resource not found";
  }

  if (code === Code.Internal || code === Code.Unknown) {
    return "Unexpected error";
  }

  return "Request failed";
}

interface PostgresClassifierInput {
  code: Code | null;
  conditionName: string | null;
  reason: string | null;
  sqlstate: string | null;
  sqlstateClass: string | null;
}

interface PostgresClassifier {
  kind: PostgresUiErrorKind;
  matches: (input: PostgresClassifierInput) => boolean;
}

function hasSetValue(values: ReadonlySet<string>, value: string | null) {
  return value !== null && values.has(value);
}

function isPostgresTimeout(input: PostgresClassifierInput): boolean {
  return (
    input.code === Code.DeadlineExceeded ||
    input.reason === "TIMEOUT" ||
    input.reason === "ERROR_REASON_TIMEOUT" ||
    hasSetValue(POSTGRES_TIMEOUT_SQLSTATES, input.sqlstate) ||
    input.conditionName === "query_canceled" ||
    input.conditionName === "transaction_timeout"
  );
}

function isPostgresUnavailable(input: PostgresClassifierInput): boolean {
  return (
    input.code === Code.Unavailable ||
    hasSetValue(POSTGRES_UNAVAILABLE_CLASSES, input.sqlstateClass) ||
    hasSetValue(POSTGRES_UNAVAILABLE_CONDITIONS, input.conditionName)
  );
}

function isPostgresAuthenticationFailed(
  input: PostgresClassifierInput
): boolean {
  return (
    input.code === Code.Unauthenticated ||
    input.sqlstateClass === "28" ||
    hasSetValue(POSTGRES_AUTHENTICATION_CONDITIONS, input.conditionName)
  );
}

function isPostgresRetryable(input: PostgresClassifierInput): boolean {
  return (
    input.code === Code.Aborted ||
    input.sqlstateClass === "40" ||
    input.sqlstate === "55P03" ||
    hasSetValue(POSTGRES_RETRYABLE_CONDITIONS, input.conditionName)
  );
}

function isPostgresPermissionDenied(input: PostgresClassifierInput): boolean {
  return (
    input.code === Code.PermissionDenied ||
    input.conditionName === "insufficient_privilege"
  );
}

function isPostgresResourceExhausted(input: PostgresClassifierInput): boolean {
  return (
    input.code === Code.ResourceExhausted ||
    hasSetValue(POSTGRES_RESOURCE_EXHAUSTED_CLASSES, input.sqlstateClass) ||
    hasSetValue(POSTGRES_RESOURCE_EXHAUSTED_CONDITIONS, input.conditionName)
  );
}

function isPostgresUnsupported(input: PostgresClassifierInput): boolean {
  return (
    input.code === Code.Unimplemented ||
    input.sqlstateClass === "0A" ||
    input.conditionName === "feature_not_supported"
  );
}

function isPostgresNotFound(input: PostgresClassifierInput): boolean {
  if (input.code === Code.InvalidArgument) {
    return false;
  }

  return (
    input.code === Code.NotFound ||
    hasSetValue(POSTGRES_NOT_FOUND_SQLSTATES, input.sqlstate) ||
    hasSetValue(POSTGRES_AMBIGUOUS_NOT_FOUND_SQLSTATES, input.sqlstate) ||
    hasSetValue(POSTGRES_NOT_FOUND_CONDITIONS, input.conditionName) ||
    hasSetValue(POSTGRES_AMBIGUOUS_NOT_FOUND_CONDITIONS, input.conditionName)
  );
}

function isPostgresConstraintViolation(
  input: PostgresClassifierInput
): boolean {
  return (
    input.code === Code.AlreadyExists ||
    input.sqlstateClass === "23" ||
    hasSetValue(POSTGRES_CONSTRAINT_CONDITIONS, input.conditionName)
  );
}

function isPostgresFailedPrecondition(input: PostgresClassifierInput): boolean {
  return (
    input.code === Code.FailedPrecondition ||
    hasSetValue(POSTGRES_FAILED_PRECONDITION_CLASSES, input.sqlstateClass) ||
    hasSetValue(POSTGRES_FAILED_PRECONDITION_CONDITIONS, input.conditionName)
  );
}

function isPostgresInvalid(input: PostgresClassifierInput): boolean {
  return (
    input.code === Code.InvalidArgument ||
    hasSetValue(POSTGRES_INVALID_CLASSES, input.sqlstateClass) ||
    hasSetValue(POSTGRES_INVALID_CONDITIONS, input.conditionName)
  );
}

function isPostgresInternal(input: PostgresClassifierInput): boolean {
  return (
    input.code === Code.Internal ||
    input.code === Code.Unknown ||
    hasSetValue(POSTGRES_INTERNAL_CLASSES, input.sqlstateClass) ||
    hasSetValue(POSTGRES_INTERNAL_CONDITIONS, input.conditionName)
  );
}

const POSTGRES_CLASSIFIERS: PostgresClassifier[] = [
  { kind: "timeout", matches: isPostgresTimeout },
  { kind: "unavailable", matches: isPostgresUnavailable },
  { kind: "authentication_failed", matches: isPostgresAuthenticationFailed },
  { kind: "retryable", matches: isPostgresRetryable },
  { kind: "permission_denied", matches: isPostgresPermissionDenied },
  { kind: "resource_exhausted", matches: isPostgresResourceExhausted },
  { kind: "unsupported", matches: isPostgresUnsupported },
  { kind: "not_found", matches: isPostgresNotFound },
  { kind: "constraint_violation", matches: isPostgresConstraintViolation },
  { kind: "failed_precondition", matches: isPostgresFailedPrecondition },
  { kind: "invalid", matches: isPostgresInvalid },
  { kind: "internal", matches: isPostgresInternal },
];

function classifyPostgresUiError({
  code,
  postgres,
  reason,
}: {
  code: Code | null;
  postgres: AppUiErrorPostgres | null;
  reason: string | null;
}): PostgresUiErrorKind | null {
  if (!postgres) {
    return null;
  }

  const input = {
    code,
    conditionName: postgres.conditionName,
    reason,
    sqlstate: postgres.sqlstate,
    sqlstateClass: postgres.sqlstateClass,
  };

  for (const classifier of POSTGRES_CLASSIFIERS) {
    if (classifier.matches(input)) {
      return classifier.kind;
    }
  }

  return "generic";
}

function buildRetryGuidance({
  code,
  postgresKind,
  reason,
}: {
  code: Code | null;
  postgresKind: PostgresUiErrorKind | null;
  reason: string | null;
}): string | null {
  if (isAppDatabaseUnavailableReason(reason)) {
    return "Retry after the meta database is available.";
  }

  if (postgresKind) {
    return POSTGRES_RETRY_GUIDANCE[postgresKind];
  }

  if (code === Code.DeadlineExceeded || code === Code.Unavailable) {
    return "The database instance may still be starting. Retry in a moment.";
  }

  return null;
}

function isManualRetryableError(source: AppErrorSource): boolean {
  return !["mutation", "runtime", "unknown"].includes(source);
}

function normalizeAppUiError(
  error: unknown,
  context?: AppUiErrorContext
): AppUiError {
  const attachedContext = readAttachedContext(error);
  const baseContext = {
    ...attachedContext,
    ...context,
  };
  const source = baseContext.source ?? "unknown";
  const connectError = error instanceof ConnectError ? error : null;
  const rawMessage =
    connectError?.rawMessage ??
    (error instanceof Error && error.message.length > 0
      ? error.message
      : "Unknown error");
  const {
    code,
    codeLabel,
    details,
    domain,
    message,
    metadata,
    postgres,
    reason,
    response,
  } = normalizeConnectErrorState(connectError, rawMessage);
  const mergedContext = response
    ? {
        ...baseContext,
        response,
      }
    : baseContext;
  const blockingReason = classifyBlockingReason({ code, postgres, reason });
  const manualRetryable = isManualRetryableError(source);
  const postgresKind = classifyPostgresUiError({
    code,
    postgres,
    reason,
  });
  const title = buildTitle({ blockingReason, code, postgresKind, reason });
  const retryGuidance = buildRetryGuidance({
    code,
    postgresKind,
    reason,
  });
  const stack = error instanceof Error ? (error.stack ?? null) : null;
  const underlyingCause = resolveUnderlyingCause(error);
  const technicalDetailsInput = {
    blockingReason,
    codeLabel,
    connectDomain: domain,
    connectReason: reason,
    context: mergedContext,
    details,
    manualRetryable,
    message,
    metadata,
    postgres,
    rawMessage,
    retryGuidance,
    source,
    stack,
    title,
    underlyingCause,
  };
  const technicalDetailsObject = buildTechnicalDetailsObject(
    technicalDetailsInput
  );
  const technicalDetails = JSON.stringify(technicalDetailsObject, null, 2);
  const technicalDetailsText = buildTechnicalDetailsText({
    codeLabel,
    connectDomain: domain,
    connectReason: reason,
    context: mergedContext,
    details,
    message,
    metadata,
    postgres,
    rawMessage,
    retryGuidance,
    source,
    stack,
    underlyingCause,
  });

  return {
    blockingReason,
    code,
    codeLabel,
    connectDomain: domain,
    connectReason: reason,
    context: mergedContext,
    details,
    manualRetryable,
    message,
    metadata,
    originalError: error,
    postgres,
    rawMessage,
    reproduction: buildReproduction({
      hasConnectError: connectError !== null,
      message,
      request: mergedContext.request,
      source,
      technicalDetails,
      technicalDetailsText,
      title,
    }),
    retryGuidance,
    source,
    stack,
    technicalDetails,
    technicalDetailsObject,
    technicalDetailsText,
    title,
  };
}

function isAppDatabaseUnavailableError(error: unknown): boolean {
  // DbProvider calls this on every render; skip building a fully normalized
  // error object when there is no error to inspect.
  if (error === null || error === undefined) {
    return false;
  }

  const { connectReason } = normalizeAppUiError(error, {
    area: "query",
    source: "query",
    surface: "silent",
  });

  return (
    connectReason === "APP_DATABASE_UNAVAILABLE" ||
    connectReason === "ERROR_REASON_APP_DATABASE_UNAVAILABLE"
  );
}

function shouldReportAppUiError(error: unknown): boolean {
  if (!(typeof error === "object" && error !== null)) {
    return true;
  }

  const errorRecord = error as Record<PropertyKey, unknown>;

  if (errorRecord[APP_UI_ERROR_REPORTED] === true) {
    return false;
  }

  errorRecord[APP_UI_ERROR_REPORTED] = true;
  return true;
}

function reportAppUiError(
  error: AppUiError,
  context?: {
    tags?: Record<string, string> | undefined;
  },
  dependencies: ReportAppUiErrorDependencies = defaultReportAppUiErrorDependencies
) {
  if (!shouldReportAppUiError(error.originalError)) {
    return;
  }

  const captureTarget =
    error.originalError instanceof Error
      ? error.originalError
      : new Error(error.message);

  dependencies.captureException(captureTarget, {
    extras: {
      app_ui_error_details_count: error.details.length,
      app_ui_error_dump: error.technicalDetails,
      app_ui_error_request_host: error.context.request?.host ?? null,
      app_ui_error_rpc_path: error.context.request?.rpcPath ?? null,
      app_ui_error_transcript: error.technicalDetailsText,
    },
    tags: {
      area: error.context.area ?? error.source,
      blocking_reason: error.blockingReason ?? "none",
      connect_code: error.codeLabel ?? "none",
      connect_reason: error.connectReason ?? "none",
      postgres_sqlstate: error.postgres?.sqlstate ?? "none",
      postgres_sqlstate_class: error.postgres?.sqlstateClass ?? "none",
      source: error.source,
      ...(context?.tags ?? {}),
    },
  });

  dependencies.logger.error(error.message, {
    appUiError: error.technicalDetailsObject,
    appUiErrorTranscript: error.technicalDetailsText,
    postgresSqlstate: error.postgres?.sqlstate ?? null,
    postgresSqlstateClass: error.postgres?.sqlstateClass ?? null,
  });

  if (error.context.surface === "toast") {
    dependencies.toast.error(error.title, {
      description: error.message,
    });
  }
}

function getBlockingRoutePath(
  blockingReason: BlockingErrorReason | null
): "/access-denied" | "/setup" | null {
  if (blockingReason === "setup_required") {
    return "/setup";
  }

  if (
    blockingReason === "permission_denied" ||
    blockingReason === "unauthenticated"
  ) {
    return "/access-denied";
  }

  return null;
}

export {
  attachAppUiErrorContext,
  getBlockingRoutePath,
  isAppDatabaseUnavailableError,
  normalizeAppUiError,
  reportAppUiError,
};
