import { create, toBinary } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, it, test, vi } from "vitest";

import {
  attachAppUiErrorContext,
  getBlockingRoutePath,
  isAppDatabaseUnavailableError,
  normalizeAppUiError,
  reportAppUiError,
} from "@/lib/ui-error";
import { buildAppUiErrorTechnicalSections } from "@/lib/ui-error-sections";
import {
  CONNECT_ERROR_SNAPSHOT_BODY_HEADER,
  CONNECT_ERROR_SNAPSHOT_CONTENT_TYPE_HEADER,
  CONNECT_ERROR_SNAPSHOT_STATUS_HEADER,
  CONNECT_ERROR_SNAPSHOT_STATUS_TEXT_HEADER,
  CONNECT_ERROR_SNAPSHOT_TRUNCATED_HEADER,
  REQUEST_PAYLOAD_SERIALIZATION_FAILURE_MESSAGE,
  STREAMING_INPUT_REQUEST_MESSAGE,
} from "@/lib/ui-error-types";
import { GetConsoleConfigRequestSchema } from "@/protogen/querylane/console/v1alpha1/console_pb";
import { PostgreSqlErrorDetailSchema } from "@/protogen/querylane/console/v1alpha1/errors_pb";

const CONNECT_FAILURE_DETAIL_COUNT = 4;
const NOT_FOUND_DETAIL_COUNT = 2;
const REQUEST_HOST = "localhost:8080";
const REQUEST_RPC_PATH =
  "querylane.console.v1alpha1.ConsoleService/GetConsoleConfig";
const POSTGRES_DETAIL_TYPE = "querylane.console.v1alpha1.PostgreSqlErrorDetail";

function encodeBinaryDetail(value: Uint8Array): string {
  return btoa(Array.from(value, (byte) => String.fromCharCode(byte)).join(""));
}

function encodePostgresErrorDetail(input: {
  conditionName: string;
  operation: string;
  serverFields?: Record<string, string>;
  sqlstate: string;
  sqlstateClass: string;
}): Uint8Array {
  return toBinary(
    PostgreSqlErrorDetailSchema,
    create(PostgreSqlErrorDetailSchema, input)
  );
}

function createPermissionDeniedFailure() {
  const error = new ConnectError("permission denied", Code.PermissionDenied, {
    authorization: "secret",
    "x-request-id": "req-123",
  });
  error.details = [
    {
      debug: {
        domain: "console.querylane.dev",
        metadata: {
          resource_name: "instances/prod-us-east",
        },
        reason: "ERROR_REASON_PERMISSION_DENIED",
      },
      type: "google.rpc.ErrorInfo",
      value: new Uint8Array([1]),
    },
    {
      debug: {
        fieldViolations: [
          {
            description: "is required",
            field: "name",
          },
        ],
      },
      type: "google.rpc.BadRequest",
      value: new Uint8Array([1]),
    },
    {
      debug: {
        resourceName: "prod-us-east",
        resourceType: "Instance",
      },
      type: "google.rpc.ResourceInfo",
      value: new Uint8Array([1]),
    },
    {
      type: "google.rpc.Help",
      value: new Uint8Array([1]),
    },
  ];

  return error;
}

function createPermissionDeniedUiError() {
  return normalizeAppUiError(createPermissionDeniedFailure(), {
    request: {
      headers: {
        "connect-protocol-version": ["1"],
        "content-type": ["application/json"],
      },
      host: REQUEST_HOST,
      plaintext: true,
      requestJson: "{}",
      requestJsonNote: null,
      requestMethod: "POST",
      rpcPath: REQUEST_RPC_PATH,
      url: `http://${REQUEST_HOST}/${REQUEST_RPC_PATH}`,
    },
    source: "connect",
  });
}

function createNotFoundFailure() {
  const resourceName =
    "instances/d6m765sdvruks1kpfmdg/databases/demos_ecommerce";
  const error = new ConnectError(
    `database not found: ${resourceName}`,
    Code.NotFound,
    {
      "content-type": "application/grpc",
    }
  );
  error.details = [
    {
      debug: {
        domain: "console.querylane.dev",
        metadata: {
          resourceName,
        },
        reason: "RESOURCE_NOT_FOUND",
      },
      type: "google.rpc.ErrorInfo",
      value: new Uint8Array([1]),
    },
    {
      debug: {
        resourceName,
        resourceType: "console.querylane.dev/Database",
      },
      type: "google.rpc.ResourceInfo",
      value: new Uint8Array([1]),
    },
  ];

  return error;
}

function createDecodedNotFoundFailure() {
  const resourceName =
    "instances/d6m765sdvruks1kpfmdg/databases/demos_ecommerce";
  const decodedErrorBody = JSON.stringify({
    code: "not_found",
    details: [
      {
        debug: {
          domain: "console.querylane.dev",
          metadata: {
            resourceName,
          },
          reason: "RESOURCE_NOT_FOUND",
        },
        type: "google.rpc.ErrorInfo",
        value: "AQ",
      },
      {
        debug: {
          resourceName,
          resourceType: "console.querylane.dev/Database",
        },
        type: "google.rpc.ResourceInfo",
        value: "AQ",
      },
    ],
    message: `database not found: ${resourceName}`,
  });

  return new ConnectError("HTTP 404", Code.Unimplemented, {
    [CONNECT_ERROR_SNAPSHOT_BODY_HEADER]: btoa(decodedErrorBody),
    [CONNECT_ERROR_SNAPSHOT_CONTENT_TYPE_HEADER]: "application/json",
    [CONNECT_ERROR_SNAPSHOT_STATUS_HEADER]: "404",
    [CONNECT_ERROR_SNAPSHOT_STATUS_TEXT_HEADER]: "Not Found",
    "content-type": "text/plain; charset=utf-8",
    "x-request-id": "req-decoded-404",
  });
}

describe("normalizeAppUiError", () => {
  it("merges attached context before normalization", () => {
    const original = new Error("request blew up");

    attachAppUiErrorContext(original, { area: "first", source: "query" });
    attachAppUiErrorContext(original, { surface: "toast" });

    const error = normalizeAppUiError(original, { area: "override" });

    expect(error.context).toMatchObject({
      area: "override",
      source: "query",
      surface: "toast",
    });
    expect(error.source).toBe("query");
    attachAppUiErrorContext("not-object", { area: "ignored" });
  });

  it("classifies blocking routes and unavailable app database reasons", () => {
    expect(getBlockingRoutePath("setup_required")).toBe("/setup");
    expect(getBlockingRoutePath("permission_denied")).toBe("/access-denied");
    expect(getBlockingRoutePath("unauthenticated")).toBe("/access-denied");
    expect(getBlockingRoutePath(null)).toBeNull();

    const unavailable = new ConnectError("app db down", Code.Unavailable);
    unavailable.details = [
      {
        debug: {
          domain: "console.querylane.dev",
          reason: "ERROR_REASON_APP_DATABASE_UNAVAILABLE",
        },
        type: "google.rpc.ErrorInfo",
        value: new Uint8Array([1]),
      },
    ];

    expect(isAppDatabaseUnavailableError(unavailable)).toBe(true);
    expect(isAppDatabaseUnavailableError(new Error("other"))).toBe(false);
    // Called on every DbProvider render: nullish input must return early
    // without building a normalized error object.
    expect(isAppDatabaseUnavailableError(null)).toBe(false);
    expect(isAppDatabaseUnavailableError(undefined)).toBe(false);
  });

  it("builds expected titles for auth, setup, invalid, internal, and generic failures", () => {
    const setupError = new ConnectError(
      "setup required",
      Code.FailedPrecondition
    );
    setupError.details = [
      {
        debug: { reason: "APP_DATABASE_NOT_CONFIGURED" },
        type: "google.rpc.ErrorInfo",
        value: new Uint8Array([1]),
      },
    ];

    expect(normalizeAppUiError(setupError).title).toBe("Setup required");
    expect(
      normalizeAppUiError(new ConnectError("login", Code.Unauthenticated)).title
    ).toBe("Authentication required");
    expect(
      normalizeAppUiError(new ConnectError("bad", Code.InvalidArgument)).title
    ).toBe("Request rejected");
    expect(
      normalizeAppUiError(new ConnectError("oops", Code.Internal)).title
    ).toBe("Unexpected error");
    expect(
      normalizeAppUiError(new ConnectError("cancelled", Code.Canceled)).title
    ).toBe("Request failed");
  });
});

describe("normalizeAppUiError PostgreSQL SQLSTATE", () => {
  it("promotes decoded PostgreSQL details into title, badges, and safe monitoring tags", () => {
    const error = new ConnectError(
      "PostgreSQL 57014: query contains api_key=secret",
      Code.DeadlineExceeded
    );
    error.details = [
      {
        debug: {
          domain: "console.querylane.dev",
          metadata: {
            conditionName: "query_canceled",
            operation: "execute_query",
            sqlstate: "57014",
            sqlstateClass: "57",
          },
          reason: "TIMEOUT",
        },
        type: "google.rpc.ErrorInfo",
        value: new Uint8Array([1]),
      },
      {
        debug: {
          conditionName: "query_canceled",
          operation: "execute_query",
          serverFields: {
            detail: "api_key=secret",
            hint: "connect to private.example.com",
            message: "query contains api_key=secret",
          },
          sqlstate: "57014",
          sqlstateClass: "57",
        },
        type: POSTGRES_DETAIL_TYPE,
        value: encodePostgresErrorDetail({
          conditionName: "query_canceled",
          operation: "execute_query",
          serverFields: {
            detail: "api_key=secret",
            hint: "connect to private.example.com",
            message: "query contains api_key=secret",
          },
          sqlstate: "57014",
          sqlstateClass: "57",
        }),
      },
    ];

    const normalized = normalizeAppUiError(error, { source: "connect" });
    const sections = buildAppUiErrorTechnicalSections(normalized);
    const captureCalls: Array<{
      capturedError: unknown;
      context: {
        extras?: Record<string, unknown> | undefined;
        tags?: Record<string, string> | undefined;
      };
    }> = [];
    const loggerCalls: Array<{
      payload: Record<string, unknown>;
    }> = [];

    reportAppUiError(normalized, undefined, {
      captureException: (capturedError, context) => {
        captureCalls.push({ capturedError, context });
      },
      logger: {
        error: (_message, payload) => {
          loggerCalls.push({ payload });
        },
      },
      toast: { error: vi.fn() },
    });
    const errorSection = sections.find((section) => section.id === "error");

    expect(normalized.title).toBe("PostgreSQL query timed out");
    expect(normalized.message).toContain("api_key=secret");
    expect(normalized.technicalDetails).toContain("api_key=secret");
    expect(normalized.technicalDetails).toContain("private.example.com");
    expect(normalized.postgres).toEqual({
      conditionName: "query_canceled",
      operation: "execute_query",
      sqlstate: "57014",
      sqlstateClass: "57",
    });
    expect(normalized.retryGuidance).toBe(
      "Retry after the query finishes or reduce the work requested."
    );
    expect(errorSection?.content).toContain("SQLSTATE: 57014");
    expect(errorSection?.content).toContain("SQLSTATE class: 57");
    expect(errorSection?.content).toContain("Condition: query_canceled");
    expect(errorSection?.content).toContain("Retry guidance:");
    expect(
      JSON.parse(normalized.technicalDetails) as Record<string, unknown>
    ).toMatchObject({
      postgres: {
        conditionName: "query_canceled",
        operation: "execute_query",
        sqlstate: "57014",
        sqlstateClass: "57",
      },
    });
    expect(captureCalls[0]?.context.tags).toMatchObject({
      postgres_sqlstate: "57014",
      postgres_sqlstate_class: "57",
    });
    expect(captureCalls[0]?.context.tags).not.toHaveProperty(
      "postgres_server_fields"
    );
    expect(loggerCalls[0]?.payload).toMatchObject({
      postgresSqlstate: "57014",
      postgresSqlstateClass: "57",
    });
    expect(JSON.stringify(captureCalls)).not.toContain("api_key=secret");
    expect(JSON.stringify(captureCalls)).not.toContain("private.example.com");
    expect(JSON.stringify(loggerCalls)).not.toContain("api_key=secret");
    expect(JSON.stringify(loggerCalls)).not.toContain("private.example.com");
  });

  it("keeps SQLSTATE operation labels that use backend casing", () => {
    const error = new ConnectError("operation coverage", Code.Internal);
    error.details = [
      {
        debug: {
          metadata: {
            conditionName: "internal_error",
            operation: "1BatchLoad",
            sqlstate: "XX000",
            sqlstateClass: "XX",
          },
        },
        type: "google.rpc.ErrorInfo",
        value: new Uint8Array([1]),
      },
    ];

    expect(normalizeAppUiError(error).postgres?.operation).toBe("1BatchLoad");
  });

  it("uses meta database copy for app database outages with SQLSTATE details", () => {
    const error = new ConnectError(
      "PostgreSQL connection_exception",
      Code.Unavailable
    );
    error.details = [
      {
        debug: {
          domain: "console.querylane.dev",
          metadata: {
            condition_name: "connection_exception",
            operation: "bootstrap",
            sqlstate: "08006",
            sqlstate_class: "08",
          },
          reason: "APP_DATABASE_UNAVAILABLE",
        },
        type: "google.rpc.ErrorInfo",
        value: new Uint8Array([1]),
      },
    ];

    const normalized = normalizeAppUiError(error);

    expect(normalized.title).toBe("Meta database unavailable");
    expect(normalized.retryGuidance).toBe(
      "Retry after the meta database is available."
    );
  });

  it("normalizes Querylane live-query saturation separately from PostgreSQL exhaustion", () => {
    const error = new ConnectError(
      "live query concurrency limit reached",
      Code.ResourceExhausted
    );
    error.details = [
      {
        debug: {
          domain: "console.querylane.dev",
          metadata: { scope: "instance" },
          reason: "LIVE_QUERY_LIMIT_EXCEEDED",
        },
        type: "google.rpc.ErrorInfo",
        value: new Uint8Array([1]),
      },
    ];

    const normalized = normalizeAppUiError(error, { source: "query" });

    expect(normalized.title).toBe("Query limit reached");
    expect(normalized.retryGuidance).toBe(
      "Another query or export is using the available capacity. Try again when it finishes."
    );
    expect(normalized.postgres).toBeNull();
  });

  it("does not route PostgreSQL permission errors to the app access-denied page", () => {
    const error = new ConnectError(
      "PostgreSQL insufficient_privilege",
      Code.PermissionDenied
    );
    error.details = [
      {
        type: POSTGRES_DETAIL_TYPE,
        value: encodePostgresErrorDetail({
          conditionName: "insufficient_privilege",
          operation: "read_rows",
          sqlstate: "42501",
          sqlstateClass: "42",
        }),
      },
    ];

    const normalized = normalizeAppUiError(error);

    expect(normalized.blockingReason).toBeNull();
    expect(getBlockingRoutePath(normalized.blockingReason)).toBeNull();
  });
});

describe("normalizeAppUiError instance warm-up failures", () => {
  it("keeps client-side deadline errors inline with retry guidance", () => {
    const normalized = normalizeAppUiError(
      new ConnectError("the operation timed out", Code.DeadlineExceeded)
    );

    expect(normalized.title).toBe("Request timed out");
    expect(normalized.retryGuidance).toBe(
      "The database instance may still be starting. Retry in a moment."
    );
    expect(normalized.blockingReason).toBeNull();
  });

  it("keeps unavailable errors inline with retry guidance", () => {
    const normalized = normalizeAppUiError(
      new ConnectError("connection refused", Code.Unavailable)
    );

    expect(normalized.title).toBe("Can't reach the server");
    expect(normalized.retryGuidance).toBe(
      "The database instance may still be starting. Retry in a moment."
    );
    expect(normalized.blockingReason).toBeNull();
  });

  it("keeps PostgreSQL authentication failures out of the app auth blocker", () => {
    const error = new ConnectError(
      "PostgreSQL invalid_password",
      Code.Unauthenticated
    );
    error.details = [
      {
        type: POSTGRES_DETAIL_TYPE,
        value: encodePostgresErrorDetail({
          conditionName: "invalid_password",
          operation: "connect",
          sqlstate: "28P01",
          sqlstateClass: "28",
        }),
      },
    ];

    const normalized = normalizeAppUiError(error);

    expect(normalized.blockingReason).toBeNull();
    expect(getBlockingRoutePath(normalized.blockingReason)).toBeNull();
  });

  it("still routes app-level unauthenticated errors to the auth blocker", () => {
    const normalized = normalizeAppUiError(
      new ConnectError("login required", Code.Unauthenticated)
    );

    expect(normalized.blockingReason).toBe("unauthenticated");
  });
});

describe("normalizeAppUiError PostgreSQL classification", () => {
  it("derives PostgreSQL titles for backend-recognized SQLSTATE classes", () => {
    const cases: Array<{
      code: Code;
      conditionName: string;
      sqlstate: string;
      sqlstateClass: string;
      title: string;
    }> = [
      {
        code: Code.Unavailable,
        conditionName: "connection_exception",
        sqlstate: "08006",
        sqlstateClass: "08",
        title: "PostgreSQL unavailable",
      },
      {
        code: Code.Unimplemented,
        conditionName: "feature_not_supported",
        sqlstate: "0A000",
        sqlstateClass: "0A",
        title: "PostgreSQL feature not supported",
      },
      {
        code: Code.InvalidArgument,
        conditionName: "cardinality_violation",
        sqlstate: "21000",
        sqlstateClass: "21",
        title: "PostgreSQL request rejected",
      },
      {
        code: Code.InvalidArgument,
        conditionName: "invalid_text_representation",
        sqlstate: "22P02",
        sqlstateClass: "22",
        title: "PostgreSQL request rejected",
      },
      {
        code: Code.FailedPrecondition,
        conditionName: "foreign_key_violation",
        sqlstate: "23503",
        sqlstateClass: "23",
        title: "PostgreSQL constraint violation",
      },
      {
        code: Code.AlreadyExists,
        conditionName: "unique_violation",
        sqlstate: "23505",
        sqlstateClass: "23",
        title: "PostgreSQL constraint violation",
      },
      {
        code: Code.DeadlineExceeded,
        conditionName: "transaction_timeout",
        sqlstate: "25P04",
        sqlstateClass: "25",
        title: "PostgreSQL query timed out",
      },
      {
        code: Code.FailedPrecondition,
        conditionName: "read_only_sql_transaction",
        sqlstate: "25006",
        sqlstateClass: "25",
        title: "PostgreSQL precondition failed",
      },
      {
        code: Code.Unauthenticated,
        conditionName: "invalid_authorization_specification",
        sqlstate: "28000",
        sqlstateClass: "28",
        title: "PostgreSQL authentication failed",
      },
      {
        code: Code.NotFound,
        conditionName: "invalid_catalog_name",
        sqlstate: "3D000",
        sqlstateClass: "3D",
        title: "PostgreSQL resource not found",
      },
      {
        code: Code.Aborted,
        conditionName: "serialization_failure",
        sqlstate: "40001",
        sqlstateClass: "40",
        title: "PostgreSQL transaction needs retry",
      },
      {
        code: Code.PermissionDenied,
        conditionName: "insufficient_privilege",
        sqlstate: "42501",
        sqlstateClass: "42",
        title: "PostgreSQL permission denied",
      },
      {
        code: Code.NotFound,
        conditionName: "undefined_column",
        sqlstate: "42703",
        sqlstateClass: "42",
        title: "PostgreSQL resource not found",
      },
      {
        code: Code.NotFound,
        conditionName: "undefined_table",
        sqlstate: "42P01",
        sqlstateClass: "42",
        title: "PostgreSQL resource not found",
      },
      {
        code: Code.InvalidArgument,
        conditionName: "undefined_table",
        sqlstate: "42P01",
        sqlstateClass: "42",
        title: "PostgreSQL request rejected",
      },
      {
        code: Code.Unavailable,
        conditionName: "cannot_connect_now",
        sqlstate: "57P03",
        sqlstateClass: "57",
        title: "PostgreSQL unavailable",
      },
      {
        code: Code.InvalidArgument,
        conditionName: "syntax_error",
        sqlstate: "42601",
        sqlstateClass: "42",
        title: "PostgreSQL request rejected",
      },
      {
        code: Code.ResourceExhausted,
        conditionName: "too_many_connections",
        sqlstate: "53300",
        sqlstateClass: "53",
        title: "PostgreSQL resources exhausted",
      },
      {
        code: Code.ResourceExhausted,
        conditionName: "program_limit_exceeded",
        sqlstate: "54000",
        sqlstateClass: "54",
        title: "PostgreSQL resources exhausted",
      },
      {
        code: Code.FailedPrecondition,
        conditionName: "lock_not_available",
        sqlstate: "55P03",
        sqlstateClass: "55",
        title: "PostgreSQL transaction needs retry",
      },
      {
        code: Code.FailedPrecondition,
        conditionName: "object_not_in_prerequisite_state",
        sqlstate: "55000",
        sqlstateClass: "55",
        title: "PostgreSQL precondition failed",
      },
      {
        code: Code.Canceled,
        conditionName: "query_canceled",
        sqlstate: "57014",
        sqlstateClass: "57",
        title: "PostgreSQL query timed out",
      },
      {
        code: Code.Unavailable,
        conditionName: "operator_intervention",
        sqlstate: "57ZZZ",
        sqlstateClass: "57",
        title: "PostgreSQL unavailable",
      },
      {
        code: Code.Internal,
        conditionName: "system_error",
        sqlstate: "58000",
        sqlstateClass: "58",
        title: "PostgreSQL internal error",
      },
      {
        code: Code.Unavailable,
        conditionName: "fdw_error",
        sqlstate: "HV000",
        sqlstateClass: "HV",
        title: "PostgreSQL unavailable",
      },
      {
        code: Code.FailedPrecondition,
        conditionName: "plpgsql_error",
        sqlstate: "P0000",
        sqlstateClass: "P0",
        title: "PostgreSQL precondition failed",
      },
      {
        code: Code.Internal,
        conditionName: "internal_error",
        sqlstate: "XX000",
        sqlstateClass: "XX",
        title: "PostgreSQL internal error",
      },
    ];

    for (const testCase of cases) {
      const error = new ConnectError(testCase.conditionName, testCase.code);
      error.details = [
        {
          type: POSTGRES_DETAIL_TYPE,
          value: encodePostgresErrorDetail({
            conditionName: testCase.conditionName,
            operation: "execute_query",
            sqlstate: testCase.sqlstate,
            sqlstateClass: testCase.sqlstateClass,
          }),
        },
      ];

      expect(normalizeAppUiError(error).title).toBe(testCase.title);
    }
  });

  it("falls back to PostgreSQL Connect code and condition names when SQLSTATE is unavailable", () => {
    const cases: Array<{
      code: Code;
      conditionName?: string;
      title: string;
    }> = [
      {
        code: Code.AlreadyExists,
        title: "PostgreSQL constraint violation",
      },
      {
        code: Code.Unknown,
        conditionName: "connection_exception",
        title: "PostgreSQL unavailable",
      },
      {
        code: Code.Unknown,
        conditionName: "invalid_authorization_specification",
        title: "PostgreSQL authentication failed",
      },
      {
        code: Code.Unknown,
        conditionName: "serialization_failure",
        title: "PostgreSQL transaction needs retry",
      },
      {
        code: Code.Unknown,
        conditionName: "unique_violation",
        title: "PostgreSQL constraint violation",
      },
      {
        code: Code.Unknown,
        conditionName: "invalid_transaction_state",
        title: "PostgreSQL precondition failed",
      },
    ];

    for (const testCase of cases) {
      const error = new ConnectError(
        testCase.conditionName ?? "postgres error",
        testCase.code
      );
      error.details = [
        {
          debug: {
            metadata: {
              ...(testCase.conditionName
                ? { condition_name: testCase.conditionName }
                : {}),
              operation: "list_views",
            },
          },
          type: "google.rpc.ErrorInfo",
          value: new Uint8Array([1]),
        },
      ];

      expect(normalizeAppUiError(error).title).toBe(testCase.title);
    }
  });
});

describe("normalizeAppUiError Connect details", () => {
  it("extracts connect metadata and blocking classification", () => {
    const error = createPermissionDeniedUiError();

    expect(error.blockingReason).toBe("permission_denied");
    expect(error.codeLabel).toBe("PermissionDenied");
    expect(error.connectDomain).toBe("console.querylane.dev");
    expect(error.connectReason).toBe("ERROR_REASON_PERMISSION_DENIED");
    expect(error.metadata["authorization"]).toEqual(["[REDACTED]"]);
    expect(error.metadata["x-request-id"]).toEqual(["req-123"]);
    expect(error.details).toHaveLength(CONNECT_FAILURE_DETAIL_COUNT);
    expect(error.details[1]?.summary).toBe("name: is required");
    expect(error.details[3]?.summary).toBe(
      "Binary detail available but no debug payload"
    );
    expect(error.manualRetryable).toBe(true);
    expect(error.reproduction?.downloadFilename).toBe(
      "request-failed-repro.json"
    );
    const technicalDetails = JSON.parse(error.technicalDetails) as {
      connect?: {
        reason?: string | null | undefined;
      };
      manualRetryable?: boolean | undefined;
      retryable?: boolean | undefined;
    };
    expect(technicalDetails.connect?.reason).toBe(
      "ERROR_REASON_PERMISSION_DENIED"
    );
    expect(technicalDetails.manualRetryable).toBe(true);
    expect(technicalDetails.retryable).toBe(true);
  });

  it("builds a cURL reproduction command and repro bundle", () => {
    const error = createPermissionDeniedUiError();

    expect(error.reproduction?.curlCommand).toContain("curl \\");
    expect(error.reproduction?.curlCommand).toContain("-X POST");
    expect(error.reproduction?.curlCommand).toContain(
      "-H 'connect-protocol-version: 1'"
    );
    expect(error.reproduction?.curlCommand).toContain(
      "-H 'content-type: application/json'"
    );
    expect(error.reproduction?.curlCommand).toContain(
      `'http://${REQUEST_HOST}/${REQUEST_RPC_PATH}'`
    );
    expect(error.reproduction?.curlCommand).toContain(
      "--data-binary @- <<'JSON'"
    );
    expect(error.reproduction?.curlCommand).toContain("{}");

    expect(error.reproduction?.downloadPayload).toEqual({
      message: "permission denied",
      request: {
        body: "{}",
        headers: {
          "connect-protocol-version": ["1"],
          "content-type": ["application/json"],
        },
        method: "POST",
        rpcPath: REQUEST_RPC_PATH,
        url: `http://${REQUEST_HOST}/${REQUEST_RPC_PATH}`,
      },
      technicalDetails: error.technicalDetails,
      title: "Access denied",
      transcript: error.technicalDetailsText,
      version: 1,
    });
  });

  it("builds syntax-highlighted technical sections for the shared error view", () => {
    const error = createPermissionDeniedUiError();
    const sections = buildAppUiErrorTechnicalSections(error);

    expect(sections[0]).toMatchObject({
      content: `grpcurl -plaintext -d '{}' ${REQUEST_HOST} ${REQUEST_RPC_PATH}`,
      language: "bash",
      title: "Request",
    });
    expect(sections[1]?.content).toContain("ERROR:");
    expect(sections[1]?.content).toContain("Code: PermissionDenied");
    expect(sections[1]?.content).toContain("Message: permission denied");
    expect(sections[2]).toMatchObject({
      language: "json",
      title: "Detail 1",
    });
    expect(sections[2]?.content).toContain(
      '"@type": "type.googleapis.com/google.rpc.ErrorInfo"'
    );
    expect(
      sections.find((section) => section.title === "Response metadata")
    ).toMatchObject({
      language: "json",
      title: "Response metadata",
    });

    const capturedErrorJsonSection = sections.find(
      (section) => section.title === "Captured error JSON"
    );
    expect(capturedErrorJsonSection).toMatchObject({
      language: "json",
      title: "Captured error JSON",
    });

    const capturedErrorJson = JSON.parse(
      capturedErrorJsonSection?.content ?? "null"
    ) as {
      request?: {
        body?: unknown | undefined;
      };
      technicalDetails?: {
        connect?: {
          reason?: string | null | undefined;
        };
        context?: {
          request?: {
            requestJson?: unknown | undefined;
          };
        };
      };
    };

    expect(capturedErrorJson.request?.body).toEqual({});
    expect(capturedErrorJson.technicalDetails?.connect?.reason).toBe(
      "ERROR_REASON_PERMISSION_DENIED"
    );
    expect(
      capturedErrorJson.technicalDetails?.context?.request?.requestJson
    ).toEqual({});
  });

  it("renders full grpc details for a not-found error sample", () => {
    const parent =
      "instances/d6m765sdvruks1kpfmdg/databases/demos_ecommerce/schemas/analytics";
    const error = normalizeAppUiError(createNotFoundFailure(), {
      request: {
        host: "localhost:8080",
        plaintext: true,
        requestJson: `{\n  "parent": "${parent}"\n}`,
        requestJsonNote: null,
        requestMethod: "POST",
        rpcPath: "querylane.console.v1alpha1.TableService/ListTables",
        url: "http://localhost:8080/querylane.console.v1alpha1.TableService/ListTables",
      },
      source: "connect",
    });

    expect(error.details).toHaveLength(NOT_FOUND_DETAIL_COUNT);
    expect(error.technicalDetailsText).toContain("grpcurl -plaintext -d '{");
    expect(error.technicalDetailsText).toContain(`"parent": "${parent}"`);
    expect(error.technicalDetailsText).toContain("Code: NotFound");
    expect(error.technicalDetailsText).toContain(
      "Message: database not found: instances/d6m765sdvruks1kpfmdg/databases/demos_ecommerce"
    );
    expect(error.technicalDetailsText).toContain(
      '"reason": "RESOURCE_NOT_FOUND"'
    );
    expect(error.technicalDetailsText).toContain(
      '"resourceType": "console.querylane.dev/Database"'
    );
  });
});

describe("normalizeAppUiError defensive fallbacks", () => {
  it("decodes connect error payloads captured from failed requests", () => {
    const error = normalizeAppUiError(createDecodedNotFoundFailure(), {
      request: {
        host: "localhost:8080",
        plaintext: true,
        requestJson: "{}",
        requestJsonNote: null,
        requestMethod: "POST",
        rpcPath: "querylane.console.v1alpha1.TableService/ListTables",
        url: "http://localhost:8080/querylane.console.v1alpha1.TableService/ListTables",
      },
      source: "connect",
    });

    expect(error.codeLabel).toBe("NotFound");
    expect(error.message).toBe(
      "database not found: instances/d6m765sdvruks1kpfmdg/databases/demos_ecommerce"
    );
    expect(error.rawMessage).toBe("HTTP 404");
    expect(error.details).toHaveLength(NOT_FOUND_DETAIL_COUNT);
    expect(error.metadata["x-request-id"]).toEqual(["req-decoded-404"]);
    expect(error.metadata[CONNECT_ERROR_SNAPSHOT_BODY_HEADER]).toBeUndefined();
    expect(error.context.response?.bodyJson).toBeTruthy();
    expect(error.technicalDetailsText).toContain("Code: NotFound");
    expect(error.technicalDetailsText).toContain(
      "Message: database not found: instances/d6m765sdvruks1kpfmdg/databases/demos_ecommerce"
    );
    expect(error.technicalDetailsText).toContain("Transport message: HTTP 404");
  });

  it("falls back to SQLSTATE details decoded from response snapshots", () => {
    const body = JSON.stringify({
      code: "invalid_argument",
      details: [
        {
          type: POSTGRES_DETAIL_TYPE,
          value: encodeBinaryDetail(
            encodePostgresErrorDetail({
              conditionName: "syntax_error",
              operation: "execute_query",
              sqlstate: "42601",
              sqlstateClass: "42",
            })
          ),
        },
      ],
      message: "PostgreSQL syntax_error during execute_query",
    });
    const error = new ConnectError("HTTP 400", Code.Unknown, {
      [CONNECT_ERROR_SNAPSHOT_BODY_HEADER]: btoa(body),
      [CONNECT_ERROR_SNAPSHOT_CONTENT_TYPE_HEADER]: "application/json",
    });

    const normalized = normalizeAppUiError(error, { source: "connect" });

    expect(normalized.title).toBe("PostgreSQL request rejected");
    expect(normalized.postgres).toEqual({
      conditionName: "syntax_error",
      operation: "execute_query",
      sqlstate: "42601",
      sqlstateClass: "42",
    });
    expect(normalized.details[0]?.summary).toBe("SQLSTATE 42601 syntax_error");
    expect(normalized.technicalDetailsText).toContain("SQLSTATE: 42601");
    expect(normalized.technicalDetailsText).toContain(
      "Retry guidance: Fix the SQL or request fields before retrying."
    );
  });

  it("summarizes every BadRequest field violation", () => {
    const error = new ConnectError("validation failed", Code.InvalidArgument);
    error.details = [
      {
        debug: {
          fieldViolations: [
            {
              description: "is required",
              field: "statement",
            },
            {
              description: "must be valid SQL",
              field: "filter",
            },
          ],
        },
        type: "google.rpc.BadRequest",
        value: new Uint8Array([1]),
      },
    ];

    const normalized = normalizeAppUiError(error);

    expect(normalized.details[0]?.summary).toBe(
      "statement: is required; filter: must be valid SQL"
    );
  });

  it("decodes plain-text response snapshots and truncated response sections", () => {
    const error = new ConnectError("HTTP 500", Code.Internal, {
      [CONNECT_ERROR_SNAPSHOT_BODY_HEADER]: btoa(
        "upstream exploded\nsecond line"
      ),
      [CONNECT_ERROR_SNAPSHOT_CONTENT_TYPE_HEADER]: "text/plain; charset=utf-8",
      [CONNECT_ERROR_SNAPSHOT_STATUS_HEADER]: "500",
      [CONNECT_ERROR_SNAPSHOT_STATUS_TEXT_HEADER]: "Internal Server Error",
      [CONNECT_ERROR_SNAPSHOT_TRUNCATED_HEADER]: "1",
    });

    const normalized = normalizeAppUiError(error, { source: "connect" });
    const sections = buildAppUiErrorTechnicalSections(normalized);

    expect(normalized.message).toBe("upstream exploded");
    expect(normalized.context.response).toMatchObject({
      bodyJson: null,
      bodyText: "upstream exploded\nsecond line",
      contentType: "text/plain; charset=utf-8",
      decodedConnectMessage: "upstream exploded",
      status: 500,
      statusText: "Internal Server Error",
      truncated: true,
    });
    expect(normalized.technicalDetailsText).toContain(
      "[response snapshot truncated]"
    );
    expect(
      sections.find((section) => section.id === "response-body")
    ).toMatchObject({
      language: "text",
      title: "Failed response body",
    });
  });

  it("summarizes unusual grpc details defensively", () => {
    const error = new ConnectError("detail coverage", Code.Unknown);
    error.details = [
      { debug: null, type: "google.rpc.BadRequest", value: new Uint8Array() },
      {
        debug: { fieldViolations: [] },
        type: "google.rpc.BadRequest",
        value: new Uint8Array(),
      },
      {
        debug: { fieldViolations: [null] },
        type: "google.rpc.BadRequest",
        value: new Uint8Array(),
      },
      { debug: null, type: "google.rpc.ErrorInfo", value: new Uint8Array() },
      { debug: null, type: "google.rpc.ResourceInfo", value: new Uint8Array() },
      {
        debug: { links: [{ url: "https://example.com" }] },
        type: "google.rpc.Help",
        value: new Uint8Array(),
      },
      {
        debug: { anything: true },
        type: "custom.Detail",
        value: new Uint8Array(),
      },
      { type: "custom.Empty", value: new Uint8Array() },
    ];

    const normalized = normalizeAppUiError(error);

    expect(normalized.details.map((detail) => detail.summary)).toEqual([
      "Structured detail available",
      "Structured detail available",
      "Structured detail available",
      "Structured detail available",
      "Structured detail available",
      "Help links available",
      "Structured detail available",
      "No debug payload available",
    ]);
  });

  it("normalizes locally attached outgoing details", () => {
    const error = new ConnectError("local detail", Code.InvalidArgument);
    const localDetail: ConnectError["details"][number] = {
      desc: GetConsoleConfigRequestSchema,
      value: {},
    };
    error.details = [localDetail];

    const normalized = normalizeAppUiError(error);

    expect(normalized.details).toEqual([
      {
        debug: {},
        hasRawValue: false,
        summary: "Outgoing detail attached locally",
        type: "querylane.console.v1alpha1.GetConsoleConfigRequest",
      },
    ]);
  });

  it("ignores malformed decoded JSON details and protocol code fallbacks", () => {
    const body = JSON.stringify({
      code: "custom_error",
      details: [
        null,
        { type: 123, value: "AQ" },
        { type: "custom.Detail", value: 123 },
        { debug: { reason: "CUSTOM" }, type: "custom.Detail", value: "AQ" },
      ],
      message: "decoded custom",
    });
    const error = new ConnectError("protocol error: bad", Code.Unknown, {
      [CONNECT_ERROR_SNAPSHOT_BODY_HEADER]: btoa(body),
      [CONNECT_ERROR_SNAPSHOT_CONTENT_TYPE_HEADER]: "application/json",
    });

    const normalized = normalizeAppUiError(error);

    expect(normalized.codeLabel).toBe("Unknown");
    expect(normalized.message).toBe("decoded custom");
    expect(normalized.details).toHaveLength(1);
    expect(normalized.details[0]?.summary).toBe("Structured detail available");
  });

  it("renders a generic transcript fallback for non-connect errors", () => {
    const error = normalizeAppUiError(new Error("boom"), {
      area: "runtime-boundary",
      source: "runtime",
    });

    expect(error.manualRetryable).toBe(false);
    expect(error.reproduction).toBeNull();
    expect(error.technicalDetailsText).toContain("ERROR:");
    expect(error.technicalDetailsText).toContain("Message: boom");
    expect(error.technicalDetailsText).toContain("Source: runtime");
    expect(error.technicalDetailsText).toContain('"area": "runtime-boundary"');
  });

  it("marks mutation errors as not manually retryable", () => {
    const error = normalizeAppUiError(new Error("save failed"), {
      area: "console.instance.configuration",
      source: "mutation",
    });

    expect(error.manualRetryable).toBe(false);
    expect(JSON.parse(error.technicalDetails)).toMatchObject({
      manualRetryable: false,
      retryable: false,
    });
  });

  it("keeps context, cause, and stack sections for non-request errors", () => {
    const error = normalizeAppUiError(
      new Error("boom", {
        cause: new Error("root cause"),
      }),
      {
        area: "runtime-boundary",
        source: "runtime",
      }
    );
    const sections = buildAppUiErrorTechnicalSections(error);

    expect(
      sections.find((section) => section.title === "Captured error JSON")
    ).toBeUndefined();
    expect(
      sections.find((section) => section.title === "Context")?.content
    ).toContain('"area": "runtime-boundary"');
    expect(
      sections.find((section) => section.title === "Cause")?.content
    ).toContain('"message": "root cause"');
    expect(
      sections.find((section) => section.title === "Stack")?.content
    ).toContain("Error: boom");
  });

  it("does not build reproduction data for setup stream failures", () => {
    const error = normalizeAppUiError(createPermissionDeniedFailure(), {
      request: {
        host: REQUEST_HOST,
        plaintext: true,
        requestJson: "{}",
        requestJsonNote: null,
        requestMethod: "POST",
        rpcPath: REQUEST_RPC_PATH,
        url: `http://${REQUEST_HOST}/${REQUEST_RPC_PATH}`,
      },
      source: "setup_stream",
    });

    expect(error.reproduction).toBeNull();
  });

  it("does not build reproduction data when the request payload was omitted", () => {
    const streamingError = normalizeAppUiError(
      createPermissionDeniedFailure(),
      {
        request: {
          host: REQUEST_HOST,
          plaintext: true,
          requestJson: null,
          requestJsonNote: STREAMING_INPUT_REQUEST_MESSAGE,
          requestMethod: "POST",
          rpcPath: REQUEST_RPC_PATH,
          url: `http://${REQUEST_HOST}/${REQUEST_RPC_PATH}`,
        },
        source: "connect",
      }
    );
    const serializationFailure = normalizeAppUiError(
      createPermissionDeniedFailure(),
      {
        request: {
          host: REQUEST_HOST,
          plaintext: true,
          requestJson: null,
          requestJsonNote: REQUEST_PAYLOAD_SERIALIZATION_FAILURE_MESSAGE,
          requestMethod: "POST",
          rpcPath: REQUEST_RPC_PATH,
          url: `http://${REQUEST_HOST}/${REQUEST_RPC_PATH}`,
        },
        source: "connect",
      }
    );

    expect(streamingError.reproduction).toBeNull();
    expect(serializationFailure.reproduction).toBeNull();
  });

  it("reports primitive originals with synthesized Error capture targets", () => {
    const error = normalizeAppUiError("plain failure", { source: "unknown" });
    const captureCalls: unknown[] = [];
    const loggerCalls: unknown[] = [];
    const dependencies = {
      captureException: (capturedError: unknown) => {
        captureCalls.push(capturedError);
      },
      logger: {
        error: (message: string) => {
          loggerCalls.push(message);
        },
      },
      toast: { error: vi.fn() },
    };

    reportAppUiError(error, undefined, dependencies);
    reportAppUiError(error, undefined, dependencies);

    expect(captureCalls).toHaveLength(2);
    const firstCaptured = captureCalls[0];
    expect(firstCaptured).toBeInstanceOf(Error);
    if (!(firstCaptured instanceof Error)) {
      throw new TypeError("expected captured error to be an Error instance");
    }
    expect(firstCaptured.message).toBe("Unknown error");
    expect(loggerCalls).toEqual(["Unknown error", "Unknown error"]);
  });
});

describe("reportAppUiError monitoring payload", () => {
  it("reports both transcript and structured dump to monitoring", () => {
    const error = createPermissionDeniedUiError();
    const parseSpy = vi.spyOn(JSON, "parse");
    const captureCalls: Array<{
      context: {
        extras?: Record<string, unknown> | undefined;
        tags?: Record<string, string> | undefined;
      };
      error: unknown;
    }> = [];
    const loggerCalls: Array<{
      message: string;
      payload: Record<string, unknown>;
    }> = [];

    reportAppUiError(
      error,
      {
        tags: {
          endpoint: REQUEST_RPC_PATH,
        },
      },
      {
        captureException: (capturedError, context) => {
          captureCalls.push({
            context: context ?? {},
            error: capturedError,
          });
          return;
        },
        logger: {
          error: (message, payload) => {
            loggerCalls.push({
              message,
              payload: (payload ?? {}) as Record<string, unknown>,
            });
          },
        },
        toast: { error: vi.fn() },
      }
    );

    expect(parseSpy).not.toHaveBeenCalled();
    expect(captureCalls).toHaveLength(1);
    expect(captureCalls[0]?.error).toBe(error.originalError);
    expect(captureCalls[0]?.context.extras?.["app_ui_error_dump"]).toBe(
      error.technicalDetails
    );
    expect(captureCalls[0]?.context.extras?.["app_ui_error_transcript"]).toBe(
      error.technicalDetailsText
    );
    expect(
      captureCalls[0]?.context.extras?.["app_ui_error_details_count"]
    ).toBe(CONNECT_FAILURE_DETAIL_COUNT);
    expect(captureCalls[0]?.context.extras?.["app_ui_error_request_host"]).toBe(
      REQUEST_HOST
    );
    expect(captureCalls[0]?.context.extras?.["app_ui_error_rpc_path"]).toBe(
      REQUEST_RPC_PATH
    );

    expect(loggerCalls).toHaveLength(1);
    expect(loggerCalls[0]?.message).toBe("permission denied");
    expect(loggerCalls[0]?.payload["appUiErrorTranscript"]).toBe(
      error.technicalDetailsText
    );
    expect(
      (loggerCalls[0]?.payload["appUiError"] as Record<string, unknown>)["code"]
    ).toBe("PermissionDenied");

    parseSpy.mockRestore();
  });
});

describe("reportAppUiError semantic filters", () => {
  function createReportingDependencies() {
    return {
      captureException: vi.fn(),
      logger: { error: vi.fn() },
      toast: { error: vi.fn() },
    };
  }

  test.each([
    {
      error: new ConnectError("cancelled", Code.Canceled),
      expectedCode: Code.Canceled,
      expectedCodeLabel: "Canceled",
      name: "Connect cancellation",
    },
    {
      error: new DOMException("aborted", "AbortError"),
      expectedCode: null,
      expectedCodeLabel: null,
      name: "browser abort",
    },
    {
      error: { name: "AbortError" },
      expectedCode: null,
      expectedCodeLabel: null,
      name: "cross-realm browser abort",
    },
    {
      error: new ConnectError("HTTP 499", Code.Unknown, {
        [CONNECT_ERROR_SNAPSHOT_BODY_HEADER]: btoa(
          JSON.stringify({ code: "canceled", message: "request canceled" })
        ),
        [CONNECT_ERROR_SNAPSHOT_CONTENT_TYPE_HEADER]: "application/json",
        [CONNECT_ERROR_SNAPSHOT_STATUS_HEADER]: "499",
      }),
      expectedCode: Code.Canceled,
      expectedCodeLabel: "Canceled",
      name: "REST cancellation payload",
    },
    {
      error: new ConnectError("HTTP 499", Code.Unknown, {
        [CONNECT_ERROR_SNAPSHOT_STATUS_HEADER]: "499",
      }),
      expectedCode: Code.Canceled,
      expectedCodeLabel: "Canceled",
      name: "empty REST cancellation response",
    },
  ])("does not report $name", ({ error, expectedCode, expectedCodeLabel }) => {
    const normalized = normalizeAppUiError(error, { surface: "toast" });
    const dependencies = createReportingDependencies();

    reportAppUiError(normalized, undefined, dependencies);

    expect(normalized.code).toBe(expectedCode);
    expect(normalized.codeLabel).toBe(expectedCodeLabel);
    expect(dependencies.captureException).not.toHaveBeenCalled();
    expect(dependencies.logger.error).not.toHaveBeenCalled();
    expect(dependencies.toast.error).not.toHaveBeenCalled();
  });

  test("does not report setup-required control flow", () => {
    const error = new ConnectError("setup required", Code.FailedPrecondition);
    error.details = [
      {
        debug: { reason: "ERROR_REASON_APP_DATABASE_NOT_CONFIGURED" },
        type: "google.rpc.ErrorInfo",
        value: new Uint8Array([1]),
      },
    ];
    const normalized = normalizeAppUiError(error, { surface: "toast" });
    const dependencies = createReportingDependencies();

    reportAppUiError(normalized, undefined, dependencies);

    expect(dependencies.captureException).not.toHaveBeenCalled();
    expect(dependencies.logger.error).not.toHaveBeenCalled();
    expect(dependencies.toast.error).not.toHaveBeenCalled();
  });

  test("lets expected-failure callers suppress later reports", () => {
    const originalError = new ConnectError(
      "connection rejected",
      Code.InvalidArgument
    );
    const normalized = normalizeAppUiError(originalError, { surface: "toast" });
    const dependencies = createReportingDependencies();

    reportAppUiError(normalized, { expected: true }, dependencies);
    reportAppUiError(normalized, undefined, dependencies);

    expect(dependencies.captureException).not.toHaveBeenCalled();
    expect(dependencies.logger.error).not.toHaveBeenCalled();
    expect(dependencies.toast.error).not.toHaveBeenCalled();
  });
});

describe("reportAppUiError toast surface", () => {
  function createSilentDependencies() {
    return {
      captureException: vi.fn(),
      logger: { error: vi.fn() },
      toast: { error: vi.fn() },
    };
  }

  test("shows an error toast for the toast surface", () => {
    const error = normalizeAppUiError(new Error("disk is full"), {
      source: "mutation",
      surface: "toast",
    });
    const dependencies = createSilentDependencies();

    reportAppUiError(error, undefined, dependencies);

    expect(dependencies.toast.error).toHaveBeenCalledTimes(1);
    expect(dependencies.toast.error).toHaveBeenCalledWith(error.title, {
      description: error.message,
    });
  });

  test("does not toast non-toast surfaces", () => {
    const inlineError = normalizeAppUiError(new Error("inline only"), {
      source: "mutation",
      surface: "inline",
    });
    const undefinedSurfaceError = normalizeAppUiError(new Error("no surface"), {
      source: "mutation",
    });
    const dependencies = createSilentDependencies();

    reportAppUiError(inlineError, undefined, dependencies);
    reportAppUiError(undefinedSurfaceError, undefined, dependencies);

    expect(dependencies.toast.error).not.toHaveBeenCalled();
    expect(dependencies.captureException).toHaveBeenCalledTimes(2);
  });

  test("does not toast the same error twice via the dedup guard", () => {
    const error = normalizeAppUiError(new Error("repeated failure"), {
      source: "mutation",
      surface: "toast",
    });
    const dependencies = createSilentDependencies();

    reportAppUiError(error, undefined, dependencies);
    reportAppUiError(error, undefined, dependencies);

    expect(dependencies.toast.error).toHaveBeenCalledTimes(1);
  });
});
