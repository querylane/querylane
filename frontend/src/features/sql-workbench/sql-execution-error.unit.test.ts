import { create, type MessageInitShape, toBinary } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, test } from "@rstest/core";
import {
  canRetrySqlExecution,
  describeSqlExecutionError,
} from "@/features/sql-workbench/sql-execution-error";
import { normalizeAppUiError } from "@/lib/ui-error";
import {
  PostgreSqlErrorDetailSchema,
  PostgreSqlErrorKind,
  PostgreSqlErrorRetryGuidance,
} from "@/protogen/querylane/console/v1alpha1/errors_pb";

function buildPostgresError(
  postgres: MessageInitShape<typeof PostgreSqlErrorDetailSchema>
) {
  const error = new ConnectError("Execute query", Code.FailedPrecondition);
  const detail = create(PostgreSqlErrorDetailSchema, {
    kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_FAILED_PRECONDITION,
    retryGuidance:
      PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_AFTER_CORRECTION,
    ...postgres,
  });
  error.details = [
    {
      type: PostgreSqlErrorDetailSchema.typeName,
      value: toBinary(PostgreSqlErrorDetailSchema, detail),
    },
  ];
  return normalizeAppUiError(error, { source: "query" });
}

describe("describeSqlExecutionError", () => {
  test("rewrites the read-only transaction rejection into workbench copy", () => {
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

  test("leads with the server message, detail and hint when the backend sent them", () => {
    const error = describeSqlExecutionError(
      buildPostgresError({
        conditionName: "undefined_column",
        serverFields: {
          hint: 'Perhaps you meant to reference the column "orders.placed_at".',
          message: 'column "created_at" does not exist',
        },
        sqlstate: "42703",
      })
    );
    expect(error.title).toBe('column "created_at" does not exist');
    expect(error.summary).toBe("PostgreSQL error 42703");
    expect(error.retryGuidance).toContain("placed_at");
  });
});

describe("canRetrySqlExecution", () => {
  test("hides retry for statement errors that need an edit first", () => {
    const error = buildPostgresError({ sqlstate: "42703" });
    expect(canRetrySqlExecution(error)).toBe(false);
  });

  test("keeps retry for transient failures", () => {
    const error = buildPostgresError({
      retryGuidance:
        PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_IMMEDIATELY,
      sqlstate: "40001",
    });
    expect(canRetrySqlExecution(error)).toBe(true);
  });
});
