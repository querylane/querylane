import { create, toBinary } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { afterEach, describe, expect, it, rs } from "@rstest/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AppErrorView } from "@/components/app-error-view";
import { normalizeAppUiError } from "@/lib/ui-error";
import {
  PostgreSqlErrorDetailSchema,
  PostgreSqlErrorKind,
  PostgreSqlErrorRetryGuidance,
} from "@/protogen/querylane/console/v1alpha1/errors_pb";

const BOOTSTRAP_RPC_PATH =
  "/querylane.console.v1alpha1.OnboardingService/Bootstrap";
const POSTGRES_DETAIL_TYPE = "querylane.console.v1alpha1.PostgreSqlErrorDetail";

function createBootError() {
  return normalizeAppUiError(
    new ConnectError("meta database is unavailable", Code.Unavailable),
    {
      area: "boot-gate",
      endpoint: BOOTSTRAP_RPC_PATH,
      source: "boot",
      surface: "route",
    }
  );
}

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

async function openErrorDetailsDialog(
  user: ReturnType<typeof userEvent.setup>
) {
  await user.click(screen.getByRole("button", { name: "Error details" }));
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

  it("announces failed detail copies", async () => {
    const user = userEvent.setup();
    const originalClipboard = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard"
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: rs.fn(() => Promise.reject(new Error("denied"))),
      },
    });

    try {
      render(<AppErrorView error={createBootError()} />);

      await openErrorDetailsDialog(user);
      await user.click(screen.getByRole("button", { name: "Copy details" }));

      expect(screen.getByRole("status").textContent).toBe(
        "Couldn't copy details"
      );
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }
    }
  });
});
