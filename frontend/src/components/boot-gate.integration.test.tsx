import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  rs,
  test,
} from "@rstest/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BootGate } from "@/components/boot-gate";
import { normalizeAppUiError } from "@/lib/ui-error";
import { GetOnboardingStateResponseSchema } from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import { useSetupStore } from "@/stores/setup-store";
import { ThemeProvider } from "@/theme-provider";

rs.mock("@tanstack/react-router", () => ({
  useLocation: ({
    select,
  }: {
    select?: (location: { pathname: string }) => unknown;
  } = {}) => {
    const location = { pathname: "/" };
    return select ? select(location) : location;
  },
}));

const LITERAL_ESCAPE_SEQUENCE_RE = /\\u2026/;

const initialSetupState = useSetupStore.getState();

beforeEach(() => {
  useSetupStore.setState({
    ...initialSetupState,
    bootstrap: rs.fn(async () => undefined),
    status: "verifying",
  });
});

afterEach(() => {
  cleanup();
  useSetupStore.setState(initialSetupState, true);
});

describe("BootGate", () => {
  test("renders the verifying state with a real ellipsis character", () => {
    render(
      <ThemeProvider>
        <BootGate>
          <div>app</div>
        </BootGate>
      </ThemeProvider>
    );

    // JSX attribute string literals do not process JS escapes, so a
    // backslash-u escape sequence would render literally.
    expect(screen.getByText("Verifying configuration…")).toBeTruthy();
    expect(screen.queryByText(LITERAL_ESCAPE_SEQUENCE_RE)).toBeNull();
  });

  test("attributes boot timeouts to the Querylane server path", () => {
    useSetupStore.setState({
      bootError: normalizeAppUiError(
        new ConnectError("deadline exceeded", Code.DeadlineExceeded),
        { source: "boot" }
      ),
      status: "boot_error",
    });

    render(
      <ThemeProvider>
        <BootGate>
          <div>app</div>
        </BootGate>
      </ThemeProvider>
    );

    expect(
      screen.getByRole("heading", { name: "Cannot reach Querylane" })
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Check that the Querylane server is running and that your network or proxy can reach it, then retry."
      )
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "The database instance may still be starting. Retry in a moment."
      )
    ).toBeNull();
  });

  test("offers internal storage recovery when the meta database blocks boot", async () => {
    const user = userEvent.setup();
    const error = new ConnectError(
      "database is currently unavailable",
      Code.Unavailable
    );
    error.details = [
      {
        debug: { reason: "ERROR_REASON_APP_DATABASE_UNAVAILABLE" },
        type: "google.rpc.ErrorInfo",
        value: new Uint8Array([1]),
      },
    ];
    useSetupStore.setState({
      bootError: normalizeAppUiError(error),
      onboardingState: create(GetOnboardingStateResponseSchema, {
        configFilePath: "/tmp/querylane/config.yaml",
        isConfigured: true,
      }),
      status: "boot_error",
    });

    render(
      <ThemeProvider defaultTheme="light">
        <BootGate>
          <div>app</div>
        </BootGate>
      </ThemeProvider>
    );

    await user.click(
      screen.getByRole("button", { name: "Reconfigure internal storage" })
    );

    screen.getByRole("heading", { name: "Reconfigure internal storage" });
    screen.getByText("/tmp/querylane/config.yaml");
  });
});
