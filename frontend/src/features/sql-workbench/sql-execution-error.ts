import type { AppUiError } from "@/lib/ui-error-types";

/** PostgreSQL rejects writes inside the workbench's read-only transaction. */
const READ_ONLY_TRANSACTION_SQLSTATE = "25006";

/**
 * Rewrites errors whose generic PostgreSQL copy hides the workbench rule that
 * caused them. Everything else passes through untouched.
 */
function describeSqlExecutionError(error: AppUiError): AppUiError {
  if (error.postgres?.sqlstate !== READ_ONLY_TRANSACTION_SQLSTATE) {
    return error;
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

export { describeSqlExecutionError };
