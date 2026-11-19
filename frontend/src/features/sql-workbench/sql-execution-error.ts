import type { AppUiError } from "@/lib/ui-error-types";
import { isNonEmptyString } from "@/lib/value-guards";
import { PostgreSqlErrorRetryGuidance } from "@/protogen/querylane/console/v1alpha1/errors_pb";

const READ_ONLY_TRANSACTION_SQLSTATE = "25006";

/** Tags workbench failures for error reporting and the details dialog. */
const SQL_WORKBENCH_ERROR_CONTEXT = {
  area: "sql-workbench",
  source: "query",
} as const;

function withServerMessage(error: AppUiError) {
  const fields = error.postgres?.serverFields;
  const message = fields?.["message"];
  if (fields === undefined || !isNonEmptyString(message)) {
    return error;
  }
  const sqlstate = error.postgres?.sqlstate;
  return {
    ...error,
    retryGuidance: fields["hint"] ?? error.retryGuidance,
    summary:
      fields["detail"] ??
      (isNonEmptyString(sqlstate)
        ? `PostgreSQL error ${sqlstate}`
        : error.summary),
    title: message,
  } satisfies AppUiError;
}

/**
 * Rewrites errors whose generic PostgreSQL copy hides what went wrong: the
 * workbench's read-only rule, or the server message itself.
 */
function describeSqlExecutionError(error: AppUiError) {
  if (error.postgres?.sqlstate !== READ_ONLY_TRANSACTION_SQLSTATE) {
    return withServerMessage(error);
  }
  return {
    ...error,
    retryGuidance:
      "Rewrite it as a read, or run it with a client that has write access.",
    summary:
      "The SQL workbench runs every statement in a read-only transaction. INSERT, UPDATE, DELETE and DDL are rejected before they change anything.",
    title: "Statement needs write access",
  } satisfies AppUiError;
}

/**
 * Whether re-running the same text can succeed. Statement errors (syntax,
 * unknown names, the read-only rule) need an edit first, so offering Retry
 * there only repeats the failure; transient errors keep it.
 */
function canRetrySqlExecution(error: AppUiError) {
  if (
    error.postgres?.retryGuidance ===
    PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_AFTER_CORRECTION
  ) {
    return false;
  }
  return error.manualRetryable;
}

export {
  canRetrySqlExecution,
  describeSqlExecutionError,
  SQL_WORKBENCH_ERROR_CONTEXT,
};
