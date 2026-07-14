import { create, toBinary } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppErrorView } from "@/components/app-error-view";
import { Button } from "@/components/ui/button";
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

function createPostgresAuthorizationSpecError() {
  const error = new ConnectError(
    "PostgreSQL invalid_authorization_specification during list_views",
    Code.InvalidArgument
  );
  error.details = [
    {
      type: POSTGRES_DETAIL_TYPE,
      value: toBinary(
        PostgreSqlErrorDetailSchema,
        create(PostgreSqlErrorDetailSchema, {
          conditionName: "invalid_authorization_specification",
          kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_UNAUTHENTICATED,
          operation: "list_views",
          retryGuidance:
            PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_AFTER_CORRECTION,
          sqlstate: "28000",
          sqlstateClass: "28",
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
  it("renders a normalized Connect error with retry and a details affordance", () => {
    const onRetry = vi.fn(async () => undefined);

    render(
      <AppErrorView
        error={createBootError()}
        onRetry={onRetry}
        variant="page"
      />
    );

    screen.getByText("Can't reach the server");
    expect(
      screen.getByRole("heading", { level: 2, name: "Can't reach the server" })
    ).toBeTruthy();
    screen.getByText("meta database is unavailable");
    screen.getByRole("button", { name: "Retry" });
    screen.getByRole("button", { name: "Error details" });
  });

  it("keeps diagnostics out of the main surface until the dialog is opened", async () => {
    const user = userEvent.setup();

    render(
      <AppErrorView
        error={createBootError()}
        onRetry={async () => undefined}
        variant="page"
      />
    );

    expect(screen.queryByText("Code: Unavailable")).toBeNull();
    expect(screen.queryByText("Source: boot")).toBeNull();

    await openErrorDetailsDialog(user);

    screen.getByText("Code: Unavailable");
    screen.getByText("Source: boot");
    screen.getByText("Retry available: yes");
    screen.getByText("Technical details");
    screen.getByRole("textbox", { name: "Technical details JSON" });
  });

  it("runs the provided retry action from the integrated retry button", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn(async () => undefined);

    render(<AppErrorView error={createBootError()} onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders caller-provided recovery actions without inventing retry", async () => {
    const user = userEvent.setup();

    render(
      <AppErrorView
        actions={<Button type="button">Go home</Button>}
        error={createBootError()}
      />
    );

    screen.getByRole("button", { name: "Go home" });
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();

    await openErrorDetailsDialog(user);
    screen.getByText("Retry available: no");
  });

  it("shows SQLSTATE badges and retry guidance for PostgreSQL errors in the dialog", async () => {
    const user = userEvent.setup();

    render(<AppErrorView error={createPostgresPermissionError()} />);

    screen.getByText("PostgreSQL permission denied");

    await openErrorDetailsDialog(user);
    screen.getByText("SQLSTATE: 42501");
    screen.getByText("SQLSTATE class: 42");
    screen.getByText("Condition: insufficient_privilege");
  });

  it("keeps the PostgreSQL server message behind the error details action", async () => {
    const user = userEvent.setup();

    render(<AppErrorView error={createPostgresPermissionError()} />);

    screen.getByText("PostgreSQL insufficient_privilege during read_rows");
    expect(
      screen.queryByText(
        "PostgreSQL 42501: permission denied for table invoices"
      )
    ).toBeNull();

    await openErrorDetailsDialog(user);

    screen.getByText("PostgreSQL 42501: permission denied for table invoices");
  });

  it("shows retry guidance on the page surface for PostgreSQL errors", () => {
    render(
      <AppErrorView error={createPostgresPermissionError()} variant="page" />
    );

    screen.getByText("PostgreSQL permission denied");
    screen.getByText("Correct the issue before retrying.");
  });

  it("renders the structured PostgreSQL authentication kind", async () => {
    const user = userEvent.setup();

    render(<AppErrorView error={createPostgresAuthorizationSpecError()} />);

    screen.getByText("PostgreSQL authentication failed");
    screen.getByText(
      "PostgreSQL invalid_authorization_specification during list_views"
    );

    await openErrorDetailsDialog(user);
    screen.getByText("Code: InvalidArgument");
    screen.getByText("SQLSTATE: 28000");
    screen.getByText("SQLSTATE class: 28");
    screen.getByText("Condition: invalid_authorization_specification");
  });

  it("announces successful detail copies", async () => {
    const user = userEvent.setup();
    const originalClipboard = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard"
    );
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    try {
      const error = createBootError();
      render(<AppErrorView error={error} />);

      await openErrorDetailsDialog(user);
      await user.click(screen.getByRole("button", { name: "Copy details" }));

      expect(writeText).toHaveBeenCalledWith(error.technicalDetails);
      expect(screen.getByRole("status").textContent).toBe("Details copied");
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }
    }
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
        writeText: vi.fn(() => Promise.reject(new Error("denied"))),
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
