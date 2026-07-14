import { Code, ConnectError } from "@connectrpc/connect";
import { toast } from "sonner";

import { captureException, logger } from "@/lib/diagnostics";
import { normalizeConnectErrorState } from "@/lib/ui-error-connect";
import type {
  AppErrorSource,
  AppUiError,
  AppUiErrorContext,
  AppUiErrorPostgres,
  BlockingErrorReason,
  ReportAppUiErrorDependencies,
} from "@/lib/ui-error-types";
import {
  PostgreSqlErrorKind,
  PostgreSqlErrorRetryGuidance,
} from "@/protogen/querylane/console/v1alpha1/errors_pb";

const APP_UI_ERROR_CONTEXT = Symbol.for("querylane.app-ui-error-context");
const APP_UI_ERROR_REPORTED = Symbol.for("querylane.app-ui-error-reported");

const POSTGRES_TITLES = {
  [PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_UNSPECIFIED]: "PostgreSQL error",
  [PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_INVALID_ARGUMENT]:
    "PostgreSQL request rejected",
  [PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_FAILED_PRECONDITION]:
    "PostgreSQL precondition failed",
  [PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_NOT_FOUND]:
    "PostgreSQL resource not found",
  [PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_ALREADY_EXISTS]:
    "PostgreSQL resource already exists",
  [PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_PERMISSION_DENIED]:
    "PostgreSQL permission denied",
  [PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_UNAUTHENTICATED]:
    "PostgreSQL authentication failed",
  [PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_ABORTED]:
    "PostgreSQL transaction conflict",
  [PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_TIMEOUT]:
    "PostgreSQL query timed out",
  [PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_UNAVAILABLE]:
    "PostgreSQL unavailable",
  [PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_RESOURCE_EXHAUSTED]:
    "PostgreSQL resource limit reached",
  [PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_UNIMPLEMENTED]:
    "PostgreSQL feature not supported",
  [PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_INTERNAL]:
    "PostgreSQL internal error",
} satisfies Record<PostgreSqlErrorKind, string>;

const POSTGRES_RETRY_GUIDANCE = {
  [PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_UNSPECIFIED]:
    null,
  [PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_AFTER_CORRECTION]:
    "Correct the issue before retrying.",
  [PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_IMMEDIATELY]:
    "Retry the request.",
  [PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_LATER]:
    "Retry later.",
} satisfies Record<PostgreSqlErrorRetryGuidance, string | null>;

const defaultReportAppUiErrorDependencies: ReportAppUiErrorDependencies = {
  captureException,
  logger,
  toast,
};

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function readAttachedContext(error: unknown): AppUiErrorContext {
  if (!isRecord(error)) {
    return {};
  }

  const attached = error[APP_UI_ERROR_CONTEXT];
  return isRecord(attached) ? (attached as AppUiErrorContext) : {};
}

function attachAppUiErrorContext(
  error: unknown,
  context: AppUiErrorContext
): void {
  if (!isRecord(error)) {
    return;
  }

  error[APP_UI_ERROR_CONTEXT] = {
    ...readAttachedContext(error),
    ...context,
  };
}

function isAppDatabaseUnavailableReason(reason: string | null): boolean {
  return (
    reason === "APP_DATABASE_UNAVAILABLE" ||
    reason === "ERROR_REASON_APP_DATABASE_UNAVAILABLE"
  );
}

function isLiveQueryLimitReason(reason: string | null): boolean {
  return (
    reason === "LIVE_QUERY_LIMIT_EXCEEDED" ||
    reason === "ERROR_REASON_LIVE_QUERY_LIMIT_EXCEEDED"
  );
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

function buildTitle({
  blockingReason,
  code,
  postgres,
  reason,
}: {
  blockingReason: BlockingErrorReason | null;
  code: Code | null;
  postgres: AppUiErrorPostgres | null;
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
  if (isLiveQueryLimitReason(reason)) {
    return "Query limit reached";
  }
  if (postgres) {
    return POSTGRES_TITLES[postgres.kind] ?? "PostgreSQL error";
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

function buildRetryGuidance({
  code,
  postgres,
  reason,
}: {
  code: Code | null;
  postgres: AppUiErrorPostgres | null;
  reason: string | null;
}): string | null {
  if (isAppDatabaseUnavailableReason(reason)) {
    return "Retry after the meta database is available.";
  }
  if (isLiveQueryLimitReason(reason)) {
    return "Another query or export is using the available capacity. Try again when it finishes.";
  }
  if (postgres) {
    return POSTGRES_RETRY_GUIDANCE[postgres.retryGuidance] ?? null;
  }
  if (code === Code.DeadlineExceeded || code === Code.Unavailable) {
    return "The database instance may still be starting. Retry in a moment.";
  }
  return null;
}

function buildSummary(postgres: AppUiErrorPostgres | null, message: string) {
  if (!postgres) {
    return message;
  }

  const condition = postgres.conditionName;
  if (condition && postgres.operation) {
    return `PostgreSQL ${condition} during ${postgres.operation}`;
  }
  if (condition) {
    return `PostgreSQL ${condition}`;
  }
  return "PostgreSQL error";
}

function isManualRetryableError(source: AppErrorSource): boolean {
  return !["mutation", "runtime", "unknown"].includes(source);
}

function buildTechnicalDetails(error: {
  codeLabel: string | null;
  connectDomain: string | null;
  connectReason: string | null;
  context: AppUiErrorContext;
  details: AppUiError["details"];
  message: string;
  metadata: Record<string, string[]>;
  postgres: AppUiErrorPostgres | null;
  source: AppErrorSource;
  stack: string | null;
  title: string;
}) {
  return JSON.stringify(
    {
      code: error.codeLabel,
      connect: {
        domain: error.connectDomain,
        reason: error.connectReason,
      },
      context: error.context,
      details: error.details,
      message: error.message,
      metadata: error.metadata,
      postgres: error.postgres,
      source: error.source,
      stack: error.stack,
      title: error.title,
    },
    null,
    2
  );
}

function normalizeAppUiError(
  error: unknown,
  context?: AppUiErrorContext
): AppUiError {
  const mergedContext = { ...readAttachedContext(error), ...context };
  const source = mergedContext.source ?? "unknown";
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
  } = normalizeConnectErrorState(connectError, rawMessage);
  const blockingReason = classifyBlockingReason({ code, postgres, reason });
  const title = buildTitle({ blockingReason, code, postgres, reason });
  const retryGuidance = buildRetryGuidance({ code, postgres, reason });
  const summary = buildSummary(postgres, message);
  const stack = error instanceof Error ? (error.stack ?? null) : null;
  const technicalDetails = buildTechnicalDetails({
    codeLabel,
    connectDomain: domain,
    connectReason: reason,
    context: mergedContext,
    details,
    message,
    metadata,
    postgres,
    source,
    stack,
    title,
  });

  return {
    blockingReason,
    code,
    codeLabel,
    connectDomain: domain,
    connectReason: reason,
    context: mergedContext,
    details,
    manualRetryable: isManualRetryableError(source),
    message,
    metadata,
    originalError: error,
    postgres,
    rawMessage,
    retryGuidance,
    source,
    stack,
    summary,
    technicalDetails,
    title,
  };
}

function isAppDatabaseUnavailableError(error: unknown): boolean {
  if (error === null || error === undefined) {
    return false;
  }

  return isAppDatabaseUnavailableReason(
    normalizeAppUiError(error, {
      area: "query",
      source: "query",
      surface: "silent",
    }).connectReason
  );
}

function isExpectedAppUiError(error: AppUiError): boolean {
  return (
    error.code === Code.Canceled ||
    error.blockingReason === "setup_required" ||
    (isRecord(error.originalError) &&
      error.originalError["name"] === "AbortError")
  );
}

function shouldReportAppUiError(error: AppUiError, expected: boolean): boolean {
  if (!isRecord(error.originalError)) {
    return !(expected || isExpectedAppUiError(error));
  }

  if (expected || isExpectedAppUiError(error)) {
    error.originalError[APP_UI_ERROR_REPORTED] = true;
    return false;
  }
  if (error.originalError[APP_UI_ERROR_REPORTED] === true) {
    return false;
  }

  error.originalError[APP_UI_ERROR_REPORTED] = true;
  return true;
}

function reportAppUiError(
  error: AppUiError,
  context?: {
    expected?: boolean | undefined;
    tags?: Record<string, string> | undefined;
  },
  dependencies: ReportAppUiErrorDependencies = defaultReportAppUiErrorDependencies
) {
  if (!shouldReportAppUiError(error, context?.expected ?? false)) {
    return;
  }

  const postgresTags = {
    postgres_sqlstate: error.postgres?.sqlstate ?? "none",
    postgres_sqlstate_class: error.postgres?.sqlstateClass ?? "none",
  };
  const safePostgresContext = error.postgres
    ? {
        conditionName: error.postgres.conditionName,
        kind: error.postgres.kind,
        operation: error.postgres.operation,
        retryGuidance: error.postgres.retryGuidance,
        sqlstate: error.postgres.sqlstate,
        sqlstateClass: error.postgres.sqlstateClass,
      }
    : null;
  let captureTarget: Error;
  if (error.postgres) {
    captureTarget = new Error(error.title);
  } else if (error.originalError instanceof Error) {
    captureTarget = error.originalError;
  } else {
    captureTarget = new Error(error.message);
  }
  const reportMessage = error.postgres ? error.title : error.message;

  dependencies.captureException(captureTarget, {
    extras: {
      app_ui_error_details_count: error.details.length,
      app_ui_error_postgres: safePostgresContext,
    },
    tags: {
      area: error.context.area ?? error.source,
      blocking_reason: error.blockingReason ?? "none",
      connect_code: error.codeLabel ?? "none",
      connect_reason: error.connectReason ?? "none",
      source: error.source,
      ...postgresTags,
      ...(context?.tags ?? {}),
    },
  });

  dependencies.logger.error(reportMessage, {
    code: error.codeLabel,
    postgres: safePostgresContext,
    reason: error.connectReason,
    source: error.source,
    title: error.title,
  });

  if (error.context.surface === "toast") {
    dependencies.toast.error(error.title, { description: error.summary });
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
