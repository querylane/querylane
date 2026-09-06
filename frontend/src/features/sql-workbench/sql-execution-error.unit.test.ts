import { describe, expect, it } from "@rstest/core";
import { describeSqlExecutionError } from "@/features/sql-workbench/sql-execution-error";
import type { AppUiError, AppUiErrorPostgres } from "@/lib/ui-error-types";
import {
  PostgreSqlErrorKind,
  PostgreSqlErrorRetryGuidance,
} from "@/protogen/querylane/console/v1alpha1/errors_pb";

const BASE_POSTGRES: AppUiErrorPostgres = {
  conditionName: null,
  kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_FAILED_PRECONDITION,
  operation: null,
  retryGuidance:
    PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_AFTER_CORRECTION,
  serverFields: {},
  sqlstate: null,
  sqlstateClass: null,
};

function buildPostgresError(
  postgres: Partial<AppUiErrorPostgres> | null
): AppUiError {
  return {
    blockingReason: null,
    code: null,
    codeLabel: null,
    connectDomain: null,
    connectReason: null,
    context: {},
    details: [],
    manualRetryable: false,
    message: "execute query: postgres SQLSTATE 25006",
    metadata: {},
    originalError: null,
    postgres: postgres ? { ...BASE_POSTGRES, ...postgres } : null,
    rawMessage: "execute query: postgres SQLSTATE 25006",
    retryGuidance: null,
    source: "query",
    stack: null,
    summary: "PostgreSQL read_only_sql_transaction during execute query",
    technicalDetails: "",
    title: "PostgreSQL rejected the request",
    unexpectedResponse: null,
  };
}

describe("describeSqlExecutionError", () => {
  it("rewrites the read-only transaction rejection into workbench copy", () => {
    const error = describeSqlExecutionError(
      buildPostgresError({
        conditionName: "read_only_sql_transaction",
        sqlstate: "25006",
      })
    );
    expect(error.title).toBe("Statement needs write access");
    expect(error.summary).toContain("read-only transaction");
    expect(error.retryGuidance).not.toBeNull();
  });

  it("leaves other postgres errors untouched", () => {
    const input = buildPostgresError({
      conditionName: "undefined_table",
      sqlstate: "42P01",
    });
    expect(describeSqlExecutionError(input)).toBe(input);
  });

  it("leaves non-postgres errors untouched", () => {
    const input = buildPostgresError(null);
    expect(describeSqlExecutionError(input)).toBe(input);
  });
});
