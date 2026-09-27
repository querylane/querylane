import { create, toBinary } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { afterEach, describe, it } from "@rstest/core";
import { cleanup, render, screen } from "@testing-library/react";

import { AppErrorView } from "@/components/app-error-view";
import { normalizeAppUiError } from "@/lib/ui-error";
import {
  PostgreSqlErrorDetailSchema,
  PostgreSqlErrorKind,
  PostgreSqlErrorRetryGuidance,
} from "@/protogen/querylane/console/v1alpha1/errors_pb";

const POSTGRES_DETAIL_TYPE = "querylane.console.v1alpha1.PostgreSqlErrorDetail";

function createPostgresPermissionError() {
  const error = new ConnectError(
    "PostgreSQL 42501: permission denied for table invoices",
    Code.PermissionDenied
  );
  error.details = [
    {
      type: POSTGRES_DETAIL_TYPE,
      value: toBinary(
        PostgreSqlErrorDetailSchema,
        create(PostgreSqlErrorDetailSchema, {
          conditionName: "insufficient_privilege",
          kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_PERMISSION_DENIED,
          operation: "read_rows",
          retryGuidance:
            PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_AFTER_CORRECTION,
          sqlstate: "42501",
          sqlstateClass: "42",
        })
      ),
    },
  ];

  return normalizeAppUiError(error, {
    source: "connect",
    surface: "inline",
  });
}

afterEach(() => {
  cleanup();
});

describe("app error view integration", () => {
  it("shows retry guidance on the page surface for PostgreSQL errors", () => {
    render(
      <AppErrorView error={createPostgresPermissionError()} variant="page" />
    );

    screen.getByText("PostgreSQL permission denied");
    screen.getByText("Correct the issue before retrying.");
  });
});
