import { Code, ConnectError } from "@connectrpc/connect";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppErrorView } from "@/components/app-error-view";
import { Button } from "@/components/ui/button";
import { normalizeAppUiError } from "@/lib/ui-error";

const BOOTSTRAP_RPC_PATH =
  "/querylane.console.v1alpha1.OnboardingService/Bootstrap";
const BOOTSTRAP_URL = `http://localhost:8080${BOOTSTRAP_RPC_PATH}`;

function createBootError() {
  return normalizeAppUiError(
    new ConnectError("meta database is unavailable", Code.Unavailable),
    {
      area: "boot-gate",
      endpoint: BOOTSTRAP_RPC_PATH,
      request: {
        headers: { "connect-protocol-version": ["1"] },
        host: "localhost:8080",
        plaintext: true,
        requestJson: "{}",
        requestJsonNote: null,
        requestMethod: "POST",
        rpcPath: BOOTSTRAP_RPC_PATH,
        url: BOOTSTRAP_URL,
      },
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
      debug: {
        domain: "console.querylane.dev",
        metadata: {
          condition_name: "insufficient_privilege",
          operation: "read_rows",
          sqlstate: "42501",
          sqlstate_class: "42",
        },
        reason: "PERMISSION_DENIED",
      },
      type: "google.rpc.ErrorInfo",
      value: new Uint8Array([1]),
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
      debug: {
        domain: "console.querylane.dev",
        metadata: {
          condition_name: "invalid_authorization_specification",
          operation: "list_views",
          sqlstate: "28000",
          sqlstate_class: "28",
        },
        reason: "INVALID_ARGUMENT",
      },
      type: "google.rpc.ErrorInfo",
      value: new Uint8Array([1]),
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
    screen.getByText("Retry after checking the role or grants.");
  });

  it("classifies PostgreSQL SQLSTATE class 28 as authentication failure", async () => {
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

  it("keeps reproduction actions available when request context is captured", async () => {
    const user = userEvent.setup();

    render(<AppErrorView error={createBootError()} />);

    await openErrorDetailsDialog(user);

    expect(
      (
        screen.getByRole("button", {
          name: "Copy details",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    expect(
      (
        screen.getByRole("button", {
          name: "Copy as cURL",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    expect(
      (screen.getByRole("button", { name: "Download" }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    expect(
      screen.queryByText("Reproduction actions require a captured API request.")
    ).toBeNull();
  });

  it("disables reproduction actions when the captured request cannot be replayed", async () => {
    const user = userEvent.setup();
    const error = normalizeAppUiError(
      new ConnectError("plain failure", Code.Unavailable),
      {
        area: "boot-gate",
        request: {
          headers: { "connect-protocol-version": ["1"] },
          host: null,
          plaintext: false,
          requestJson: null,
          requestJsonNote: null,
          requestMethod: null,
          rpcPath: null,
          url: null,
        },
        source: "boot",
        surface: "route",
      }
    );

    render(<AppErrorView error={error} />);

    await openErrorDetailsDialog(user);

    expect(
      (
        screen.getByRole("button", {
          name: "Copy as cURL",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Download" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    screen.getByText("Reproduction actions require a captured API request.");
  });
});
