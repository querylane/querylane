import { create, toBinary } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { normalizeAppUiError } from "@/lib/ui-error";
import {
  PostgreSqlErrorDetailSchema,
  PostgreSqlErrorKind,
  PostgreSqlErrorRetryGuidance,
} from "@/protogen/querylane/console/v1alpha1/errors_pb";

const POSTGRES_DETAIL_TYPE = "querylane.console.v1alpha1.PostgreSqlErrorDetail";

interface PostgresErrorExample {
  code: Code;
  conditionName: string;
  kind: PostgreSqlErrorKind;
  label: string;
  message: string;
  operation: string;
  sqlstate: string;
}

const POSTGRES_PERMISSION_ERROR_EXAMPLE = {
  code: Code.PermissionDenied,
  conditionName: "insufficient_privilege",
  kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_PERMISSION_DENIED,
  label: "Permission denied",
  message: "permission denied for table invoices",
  operation: "read_rows",
  sqlstate: "42501",
} satisfies PostgresErrorExample;

const POSTGRES_ERROR_EXAMPLES = [
  {
    code: Code.Unauthenticated,
    conditionName: "invalid_password",
    kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_UNAUTHENTICATED,
    label: "Invalid password",
    message: 'password authentication failed for user "reporting"',
    operation: "connect",
    sqlstate: "28P01",
  },
  POSTGRES_PERMISSION_ERROR_EXAMPLE,
  {
    code: Code.InvalidArgument,
    conditionName: "syntax_error",
    kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_INVALID_ARGUMENT,
    label: "SQL syntax error",
    message: 'syntax error at or near "FROM"',
    operation: "execute_query",
    sqlstate: "42601",
  },
  {
    code: Code.AlreadyExists,
    conditionName: "unique_violation",
    kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_ALREADY_EXISTS,
    label: "Unique constraint violation",
    message: 'duplicate key value violates unique constraint "users_email_key"',
    operation: "create_user",
    sqlstate: "23505",
  },
] satisfies readonly PostgresErrorExample[];

function createPostgresError(example: PostgresErrorExample) {
  const error = new ConnectError(
    `PostgreSQL ${example.sqlstate}: ${example.message}`,
    example.code
  );

  error.details = [
    {
      type: POSTGRES_DETAIL_TYPE,
      value: toBinary(
        PostgreSqlErrorDetailSchema,
        create(PostgreSqlErrorDetailSchema, {
          conditionName: example.conditionName,
          kind: example.kind,
          operation: example.operation,
          retryGuidance:
            PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_AFTER_CORRECTION,
          serverFields: { message: example.message },
          sqlstate: example.sqlstate,
          sqlstateClass: example.sqlstate.slice(0, 2),
        })
      ),
    },
  ];

  return normalizeAppUiError(error, {
    source: "connect",
    surface: "inline",
  });
}

export type { PostgresErrorExample };
export {
  createPostgresError,
  POSTGRES_ERROR_EXAMPLES,
  POSTGRES_PERMISSION_ERROR_EXAMPLE,
};
