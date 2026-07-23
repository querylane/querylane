import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SetupTestProvider } from "@/__tests__/setup-test-provider";
import { createSetupContextValue } from "@/__tests__/setup-test-utils";
import { BootGate } from "@/components/boot-gate";

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

afterEach(() => {
  cleanup();
});

describe("BootGate", () => {
  test("renders the verifying state with a real ellipsis character", () => {
    render(
      <SetupTestProvider
        value={createSetupContextValue({ status: "verifying" })}
      >
        <BootGate>
          <div>app</div>
        </BootGate>
      </SetupTestProvider>
    );

    // JSX attribute string literals do not process JS escapes, so a
    // backslash-u escape sequence would render literally.
    expect(screen.getByText("Verifying configuration…")).toBeTruthy();
    expect(screen.queryByText(LITERAL_ESCAPE_SEQUENCE_RE)).toBeNull();
  });
});
