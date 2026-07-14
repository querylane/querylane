import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BootGate } from "@/components/boot-gate";
import { useSetupStore } from "@/stores/setup-store";

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
      <BootGate>
        <div>{"app"}</div>
      </BootGate>
    );

    // JSX attribute string literals do not process JS escapes, so a
    // backslash-u escape sequence would render literally.
    expect(screen.getByText("Verifying configuration…")).toBeTruthy();
    expect(screen.queryByText(LITERAL_ESCAPE_SEQUENCE_RE)).toBeNull();
  });
});
