import { Code, ConnectError } from "@connectrpc/connect";
import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { afterEach, beforeEach, expect, rs, test } from "@rstest/core";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { BootGate } from "@/components/boot-gate";
import { normalizeAppUiError } from "@/lib/ui-error";
import { useSetupStore } from "@/stores/setup-store";

// Pixels for the boot error live in e2e/visual/feedback-states.spec.ts.

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

const initialSetupState = useSetupStore.getState();

beforeEach(() => {
  useSetupStore.setState({
    ...initialSetupState,
    bootError: normalizeAppUiError(
      new ConnectError("deadline exceeded", Code.DeadlineExceeded),
      { source: "boot" }
    ),
    bootstrap: rs.fn(async () => undefined),
    status: "boot_error",
  });
});

afterEach(() => {
  useSetupStore.setState(initialSetupState, true);
});

test("boot failure keeps Querylane reachability guidance inside the app shell", async () => {
  await render(
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
});
