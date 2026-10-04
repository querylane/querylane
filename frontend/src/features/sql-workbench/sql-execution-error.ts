import type { AppUiError } from "@/lib/ui-error-types";
import { PostgreSqlErrorRetryGuidance } from "@/protogen/querylane/console/v1alpha1/errors_pb";

/** PostgreSQL rejects writes inside the workbench's read-only transaction. */
const READ_ONLY_TRANSACTION_SQLSTATE = "25006";

/** Tags workbench failures for error reporting and the details dialog. */
const SQL_WORKBENCH_ERROR_CONTEXT = {
  area: "sql-workbench",
  source: "query",
} as const;

/**
 * Puts PostgreSQL's own words up front. The app-wide normalizer keeps server
 * text out of titles because connection and auth failures can echo secrets;
 * the backend only attaches these client fields for statement errors it deems
 * safe to show, and in a SQL client the server's message about the user's own
 * statement is the feedback.
 */
function withServerMessage(error: AppUiError): AppUiError {
  const fields = error.postgres?.serverFields;
  const message = fields?.["message"];
  if (!message) {
    return error;
  }
  const sqlstate = error.postgres?.sqlstate;
  return {
    ...error,
    retryGuidance: fields["hint"] ?? error.retryGuidance,
    summary:
      fields["detail"] ??
      (sqlstate ? `PostgreSQL error ${sqlstate}` : error.summary),
    title: message,
  };
}

/**
 * Rewrites errors whose generic PostgreSQL copy hides what went wrong: the
 * workbench's read-only rule, or the server message itself.
 */
function describeSqlExecutionError(error: AppUiError): AppUiError {
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
  };
}

/**
 * Whether re-running the same text can succeed. Statement errors (syntax,
 * unknown names, the read-only rule) need an edit first, so offering Retry
 * there only repeats the failure; transient errors keep it.
 */
function canRetrySqlExecution(error: AppUiError): boolean {
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
