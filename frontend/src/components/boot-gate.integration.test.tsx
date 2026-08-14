import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BootGate } from "@/components/boot-gate";
import { normalizeAppUiError } from "@/lib/ui-error";
import { GetOnboardingStateResponseSchema } from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import { useSetupStore } from "@/stores/setup-store";
import { ThemeProvider } from "@/theme-provider";

vi.mock("@tanstack/react-router", () => ({
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
    bootstrap: vi.fn(async () => undefined),
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
      <ThemeProvider defaultTheme="light">
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
