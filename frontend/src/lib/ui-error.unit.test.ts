import { create, toBinary } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { expect, rs, test } from "@rstest/core";
import { toast } from "sonner";
import { logger } from "@/lib/diagnostics";
import {
  PostgreSqlErrorDetailSchema,
  PostgreSqlErrorKind,
  PostgreSqlErrorRetryGuidance,
} from "@/protogen/querylane/console/v1alpha1/errors_pb";
import { normalizeAppUiError, reportAppUiError } from "./ui-error";

const postgresDetail = "querylane.console.v1alpha1.PostgreSqlErrorDetail";
const credential = "password=top-secret private.example.test";

test("PostgreSQL diagnostics stay out of visible notifications and telemetry", () => {
  const error = new ConnectError(
    `PostgreSQL 42501: ${credential}`,
    Code.PermissionDenied
  );
  error.details = [
    {
      type: postgresDetail,
      value: toBinary(
        PostgreSqlErrorDetailSchema,
        create(PostgreSqlErrorDetailSchema, {
          conditionName: "insufficient_privilege",
          kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_PERMISSION_DENIED,
          operation: "execute_query",
          retryGuidance:
            PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_AFTER_CORRECTION,
          serverFields: { detail: credential, message: credential },
          sqlstate: "42501",
        })
      ),
    },
  ];

  const logged = rs.spyOn(logger, "error");
  const notified = rs.spyOn(toast, "error");
  try {
    const normalized = normalizeAppUiError(error, {
      source: "mutation",
      surface: "toast",
    });
    reportAppUiError(normalized);
    reportAppUiError(normalized);

    expect(normalized).toMatchObject({
      blockingReason: null,
      retryGuidance: "Correct the issue before retrying.",
      summary: "PostgreSQL insufficient_privilege during execute_query",
      title: "PostgreSQL permission denied",
    });
    expect(normalized.technicalDetails).toContain(credential);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(notified).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(credential);
    expect(JSON.stringify(notified.mock.calls)).not.toContain(credential);
  } finally {
    logged.mockRestore();
    notified.mockRestore();
  }
});

test("malformed PostgreSQL details use a safe fallback instead of exposing the server message", () => {
  const error = new ConnectError(credential, Code.Unknown);
  error.details = [{ type: postgresDetail, value: new Uint8Array([0xff]) }];

  const normalized = normalizeAppUiError(error);

  expect(normalized).toMatchObject({
    retryGuidance: null,
    summary: "PostgreSQL error",
    title: "PostgreSQL error",
  });
  expect(normalized.technicalDetails).toContain(credential);
});
