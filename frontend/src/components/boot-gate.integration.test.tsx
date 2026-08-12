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
import { BootGate } from "@/components/boot-gate";
import { normalizeAppUiError } from "@/lib/ui-error";
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
});
