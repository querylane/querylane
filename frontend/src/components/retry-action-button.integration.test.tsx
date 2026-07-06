import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, test, vi } from "vitest";

import { RetryActionButton } from "@/components/retry-action-button";

afterEach(() => {
  cleanup();
});

// StrictMode runs effects mount → cleanup → mount. A mounted-ref that is only
// cleared on cleanup (never re-set on mount) would stay false, so the pending
// reset in the retry `finally` would be skipped and the button would wedge on
// "Retrying…" forever. This guards against that regression.
test("re-enables the retry button after a failed retry under StrictMode", async () => {
  const onRetry = vi.fn(() => Promise.reject(new Error("still unreachable")));

  render(
    <StrictMode>
      <RetryActionButton label="Retry" onRetry={onRetry} />
    </StrictMode>
  );

  const button = screen.getByRole("button", { name: "Retry" });
  button.click();

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Retrying..." })).toBeTruthy();
  });

  await waitFor(() => {
    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton.hasAttribute("disabled")).toBe(false);
  });

  expect(onRetry).toHaveBeenCalledTimes(1);
});
