import { Code, ConnectError } from "@connectrpc/connect";

function createPostgresSqlstateError({
  code,
  conditionName,
  operation,
  reason,
  sqlstate,
  sqlstateClass,
}: {
  code: Code;
  conditionName: string;
  operation: string;
  reason: string;
  sqlstate: string;
  sqlstateClass: string;
}) {
  const error = new ConnectError(
    `PostgreSQL ${conditionName} during ${operation}`,
    code
  );
  error.details = [
    {
      debug: {
        domain: "console.querylane.dev",
        metadata: {
          condition_name: conditionName,
          operation,
          sqlstate,
          sqlstate_class: sqlstateClass,
        },
        reason,
      },
      type: "google.rpc.ErrorInfo",
      value: new Uint8Array([1]),
    },
  ];
  return error;
}

const SQLSTATE_SCENARIOS = [
  {
    endpoint: "DatabaseCatalog",
    error: createPostgresSqlstateError({
      code: Code.Unauthenticated,
      conditionName: "invalid_password",
      operation: "list_views",
      reason: "UNAUTHENTICATED",
      sqlstate: "28P01",
      sqlstateClass: "28",
    }),
    label: "Catalog authentication",
    slug: "authentication",
    sqlstate: "28P01",
  },
  {
    endpoint: "ReadRows",
    error: createPostgresSqlstateError({
      code: Code.PermissionDenied,
      conditionName: "insufficient_privilege",
      operation: "read_rows",
      reason: "PERMISSION_DENIED",
      sqlstate: "42501",
      sqlstateClass: "42",
    }),
    label: "Query permissions",
    slug: "permission",
    sqlstate: "42501",
  },
  {
    endpoint: "ListTableIndexes",
    error: createPostgresSqlstateError({
      code: Code.Unavailable,
      conditionName: "cannot_connect_now",
      operation: "list_indexes",
      reason: "UNAVAILABLE",
      sqlstate: "57P03",
      sqlstateClass: "57",
    }),
    label: "Server availability",
    slug: "availability",
    sqlstate: "57P03",
  },
] as const;

export { SQLSTATE_SCENARIOS };
