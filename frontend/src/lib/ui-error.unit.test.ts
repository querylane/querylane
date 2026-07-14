import { create, toBinary } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, test, vi } from "vitest";

import {
  attachAppUiErrorContext,
  getBlockingRoutePath,
  isAppDatabaseUnavailableError,
  normalizeAppUiError,
  reportAppUiError,
} from "@/lib/ui-error";
import {
  PostgreSqlErrorDetailSchema,
  PostgreSqlErrorKind,
  PostgreSqlErrorRetryGuidance,
} from "@/protogen/querylane/console/v1alpha1/errors_pb";

const POSTGRES_DETAIL_TYPE = "querylane.console.v1alpha1.PostgreSqlErrorDetail";
const AFTER_CORRECTION = "Correct the issue before retrying.";
const IMMEDIATELY = "Retry the request.";
const LATER = "Retry later.";

function createPostgresFailure({
  code = Code.Unknown,
  conditionName = "syntax_error",
  kind,
  message = "PostgreSQL rejected the request",
  operation = "execute_query",
  retryGuidance,
  serverFields = {},
  sqlstate = "42601",
  sqlstateClass = "42",
}: {
  code?: Code;
  conditionName?: string;
  kind: PostgreSqlErrorKind;
  message?: string;
  operation?: string;
  retryGuidance: PostgreSqlErrorRetryGuidance;
  serverFields?: Record<string, string>;
  sqlstate?: string;
  sqlstateClass?: string;
}) {
  const error = new ConnectError(message, code);
  error.details = [
    {
      type: POSTGRES_DETAIL_TYPE,
      value: toBinary(
        PostgreSqlErrorDetailSchema,
        create(PostgreSqlErrorDetailSchema, {
          conditionName,
          kind,
          operation,
          retryGuidance,
          serverFields,
          sqlstate,
          sqlstateClass,
        })
      ),
    },
  ];
  return error;
}

function createReportingDependencies() {
  return {
    captureException: vi.fn(),
    logger: { error: vi.fn() },
    toast: { error: vi.fn() },
  };
}

describe("PostgreSQL structured error rendering", () => {
  test.each([
    {
      guidance: AFTER_CORRECTION,
      kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_INVALID_ARGUMENT,
      retry:
        PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_AFTER_CORRECTION,
      title: "PostgreSQL request rejected",
    },
    {
      guidance: AFTER_CORRECTION,
      kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_FAILED_PRECONDITION,
      retry:
        PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_AFTER_CORRECTION,
      title: "PostgreSQL precondition failed",
    },
    {
      guidance: AFTER_CORRECTION,
      kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_NOT_FOUND,
      retry:
        PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_AFTER_CORRECTION,
      title: "PostgreSQL resource not found",
    },
    {
      guidance: AFTER_CORRECTION,
      kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_ALREADY_EXISTS,
      retry:
        PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_AFTER_CORRECTION,
      title: "PostgreSQL resource already exists",
    },
    {
      guidance: AFTER_CORRECTION,
      kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_PERMISSION_DENIED,
      retry:
        PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_AFTER_CORRECTION,
      title: "PostgreSQL permission denied",
    },
    {
      guidance: AFTER_CORRECTION,
      kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_UNAUTHENTICATED,
      retry:
        PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_AFTER_CORRECTION,
      title: "PostgreSQL authentication failed",
    },
    {
      guidance: IMMEDIATELY,
      kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_ABORTED,
      retry:
        PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_IMMEDIATELY,
      title: "PostgreSQL transaction conflict",
    },
    {
      guidance: LATER,
      kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_TIMEOUT,
      retry: PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_LATER,
      title: "PostgreSQL query timed out",
    },
    {
      guidance: LATER,
      kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_UNAVAILABLE,
      retry: PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_LATER,
      title: "PostgreSQL unavailable",
    },
    {
      guidance: LATER,
      kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_RESOURCE_EXHAUSTED,
      retry: PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_LATER,
      title: "PostgreSQL resource limit reached",
    },
    {
      guidance: AFTER_CORRECTION,
      kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_UNIMPLEMENTED,
      retry:
        PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_AFTER_CORRECTION,
      title: "PostgreSQL feature not supported",
    },
    {
      guidance: LATER,
      kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_INTERNAL,
      retry: PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_LATER,
      title: "PostgreSQL internal error",
    },
  ])("renders $title from the backend enums", ({
    guidance,
    kind,
    retry,
    title,
  }) => {
    const normalized = normalizeAppUiError(
      createPostgresFailure({ kind, retryGuidance: retry })
    );

    expect(normalized.title).toBe(title);
    expect(normalized.retryGuidance).toBe(guidance);
  });

  test.each([
    {
      expectedGuidance: null,
      expectedTitle: "PostgreSQL error",
      kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_UNSPECIFIED,
      name: "missing enums",
      retry:
        PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_UNSPECIFIED,
    },
    {
      expectedGuidance: null,
      expectedTitle: "PostgreSQL error",
      kind: 99 as PostgreSqlErrorKind,
      name: "unknown enums",
      retry: 99 as PostgreSqlErrorRetryGuidance,
    },
    {
      expectedGuidance: null,
      expectedTitle: "PostgreSQL permission denied",
      kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_PERMISSION_DENIED,
      name: "known kind with unknown retry",
      retry: 99 as PostgreSqlErrorRetryGuidance,
    },
    {
      expectedGuidance: LATER,
      expectedTitle: "PostgreSQL error",
      kind: 99 as PostgreSqlErrorKind,
      name: "unknown kind with known retry",
      retry: PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_LATER,
    },
  ])("uses compatibility fallback for $name", ({
    expectedGuidance,
    expectedTitle,
    kind,
    retry,
  }) => {
    const normalized = normalizeAppUiError(
      createPostgresFailure({ kind, retryGuidance: retry })
    );

    expect(normalized.title).toBe(expectedTitle);
    expect(normalized.retryGuidance).toBe(expectedGuidance);
  });

  test("uses native structured details instead of SQLSTATE or Connect code", () => {
    const normalized = normalizeAppUiError(
      createPostgresFailure({
        code: Code.Unauthenticated,
        conditionName: "invalid_password",
        kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_INVALID_ARGUMENT,
        retryGuidance:
          PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_LATER,
        sqlstate: "28P01",
        sqlstateClass: "28",
      })
    );

    expect(normalized.title).toBe("PostgreSQL request rejected");
    expect(normalized.retryGuidance).toBe(LATER);
    expect(normalized.postgres).toMatchObject({
      conditionName: "invalid_password",
      operation: "execute_query",
      sqlstate: "28P01",
      sqlstateClass: "28",
    });
    expect(normalized.blockingReason).toBeNull();
  });

  test("confines hostile server text to details and copied diagnostics", () => {
    const hostileText = "password=top-secret private.example.test";
    const normalized = normalizeAppUiError(
      createPostgresFailure({
        code: Code.PermissionDenied,
        kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_PERMISSION_DENIED,
        message: `PostgreSQL 42501: ${hostileText}`,
        retryGuidance:
          PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_AFTER_CORRECTION,
        serverFields: { detail: hostileText, message: hostileText },
        sqlstate: "42501",
      }),
      { source: "connect", surface: "toast" }
    );
    const dependencies = createReportingDependencies();

    reportAppUiError(normalized, undefined, dependencies);

    expect(normalized.title).not.toContain(hostileText);
    expect(normalized.summary).not.toContain(hostileText);
    expect(normalized.retryGuidance).not.toContain(hostileText);
    expect(normalized.technicalDetails).toContain(hostileText);
    expect(normalized.message).toContain(hostileText);
    expect(
      JSON.stringify(dependencies.captureException.mock.calls)
    ).not.toContain(hostileText);
    expect(JSON.stringify(dependencies.logger.error.mock.calls)).not.toContain(
      hostileText
    );
    expect(JSON.stringify(dependencies.toast.error.mock.calls)).not.toContain(
      hostileText
    );
  });

  test("keeps malformed PostgreSQL details on the safe generic renderer", () => {
    const hostileText = "password=top-secret private.example.test";
    const error = new ConnectError(hostileText, Code.Unknown);
    error.details = [
      {
        type: POSTGRES_DETAIL_TYPE,
        value: new Uint8Array([0xff]),
      },
    ];

    const normalized = normalizeAppUiError(error);

    expect(normalized.title).toBe("PostgreSQL error");
    expect(normalized.summary).toBe("PostgreSQL error");
    expect(normalized.retryGuidance).toBeNull();
    expect(normalized.technicalDetails).toContain(hostileText);
  });
});

describe("error routing and reporting", () => {
  test("preserves meta database copy without exposing server fields", () => {
    const error = createPostgresFailure({
      code: Code.Unavailable,
      kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_UNAVAILABLE,
      retryGuidance:
        PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_LATER,
      serverFields: {},
    });
    error.details.unshift({
      debug: {
        domain: "console.querylane.dev",
        reason: "ERROR_REASON_APP_DATABASE_UNAVAILABLE",
      },
      type: "google.rpc.ErrorInfo",
      value: new Uint8Array([1]),
    });

    const normalized = normalizeAppUiError(error);

    expect(normalized.title).toBe("Meta database unavailable");
    expect(normalized.retryGuidance).toBe(
      "Retry after the meta database is available."
    );
    expect(isAppDatabaseUnavailableError(error)).toBe(true);
  });

  test("keeps setup and app authorization blockers routed", () => {
    const setupError = new ConnectError(
      "setup required",
      Code.FailedPrecondition
    );
    setupError.details = [
      {
        debug: { reason: "ERROR_REASON_APP_DATABASE_NOT_CONFIGURED" },
        type: "google.rpc.ErrorInfo",
        value: new Uint8Array([1]),
      },
    ];

    expect(normalizeAppUiError(setupError).blockingReason).toBe(
      "setup_required"
    );
    expect(
      normalizeAppUiError(new ConnectError("login", Code.Unauthenticated))
        .blockingReason
    ).toBe("unauthenticated");
    expect(
      normalizeAppUiError(new ConnectError("denied", Code.PermissionDenied))
        .blockingReason
    ).toBe("permission_denied");
    expect(getBlockingRoutePath("setup_required")).toBe("/setup");
    expect(getBlockingRoutePath("unauthenticated")).toBe("/access-denied");
    expect(getBlockingRoutePath("permission_denied")).toBe("/access-denied");
    expect(getBlockingRoutePath(null)).toBeNull();
  });

  test.each([
    new ConnectError("canceled", Code.Canceled),
    new ConnectError("HTTP 499", Code.Unknown),
    new DOMException("aborted", "AbortError"),
    { name: "AbortError" },
  ])("does not report cancellation control flow", (error) => {
    const normalized = normalizeAppUiError(error, { surface: "toast" });
    const dependencies = createReportingDependencies();

    reportAppUiError(normalized, undefined, dependencies);

    expect(dependencies.captureException).not.toHaveBeenCalled();
    expect(dependencies.logger.error).not.toHaveBeenCalled();
    expect(dependencies.toast.error).not.toHaveBeenCalled();
  });

  test("lets expected failure callers suppress later reports", () => {
    const original = new ConnectError(
      "connection rejected",
      Code.InvalidArgument
    );
    const normalized = normalizeAppUiError(original, { surface: "toast" });
    const dependencies = createReportingDependencies();

    reportAppUiError(normalized, { expected: true }, dependencies);
    reportAppUiError(normalized, undefined, dependencies);

    expect(dependencies.captureException).not.toHaveBeenCalled();
    expect(dependencies.logger.error).not.toHaveBeenCalled();
    expect(dependencies.toast.error).not.toHaveBeenCalled();
  });

  test("keeps generic non-RPC failures useful", () => {
    const original = new Error("disk is full");
    attachAppUiErrorContext(original, {
      area: "instance-settings",
      source: "mutation",
      surface: "toast",
    });
    const normalized = normalizeAppUiError(original);
    const dependencies = createReportingDependencies();

    reportAppUiError(normalized, undefined, dependencies);

    expect(normalized).toMatchObject({
      code: null,
      manualRetryable: false,
      message: "disk is full",
      summary: "disk is full",
      title: "Request failed",
    });
    expect(normalized.technicalDetails).toContain("disk is full");
    expect(JSON.parse(normalized.technicalDetails)).toMatchObject({
      stack: original.stack,
    });
    expect(dependencies.captureException).toHaveBeenCalledWith(
      original,
      expect.any(Object)
    );
    expect(dependencies.logger.error).toHaveBeenCalled();
    expect(dependencies.toast.error).toHaveBeenCalledWith("Request failed", {
      description: "disk is full",
    });
  });
});
