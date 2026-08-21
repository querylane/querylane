import { Code, ConnectError } from "@connectrpc/connect";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { BootGate } from "@/components/boot-gate";
import { normalizeAppUiError } from "@/lib/ui-error";
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

const initialSetupState = useSetupStore.getState();

beforeEach(() => {
  useSetupStore.setState({
    ...initialSetupState,
    bootError: normalizeAppUiError(
      new ConnectError("deadline exceeded", Code.DeadlineExceeded),
      { source: "boot" }
    ),
    bootstrap: vi.fn(async () => undefined),
    status: "boot_error",
  });
});

afterEach(async () => {
  await cleanup();
  useSetupStore.setState(initialSetupState, true);
});

test("boot failure keeps Querylane reachability guidance inside the app shell", async () => {
  render(
    <ScreenshotFrame>
      <BootGate>
        <div>app</div>
      </BootGate>
    </ScreenshotFrame>
  );

  await expect
    .element(page.getByRole("heading", { name: "Cannot reach Querylane" }))
    .toBeVisible();
  await expect
    .element(
      page.getByText(
        "Check that the Querylane server is running and that your network or proxy can reach it, then retry."
      )
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Retry" }))
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "boot-querylane-unreachable"
  );
});
