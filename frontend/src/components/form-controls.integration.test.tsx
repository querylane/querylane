import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PasswordInput } from "@/components/password-input";
import { RetryActionButton } from "@/components/retry-action-button";

afterEach(() => cleanup());

describe("form controls integration", () => {
  it("keeps passwords masked until the user explicitly reveals them", async () => {
    const user = userEvent.setup();

    render(<PasswordInput aria-label="Password" defaultValue="secret" />);

    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");

    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(input.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeTruthy();
  });

  it("disables password reveal when the field itself is disabled", () => {
    render(<PasswordInput aria-label="Password" disabled={true} />);

    const input = screen.getByLabelText("Password") as HTMLInputElement;
    const toggle = screen.getByRole("button", {
      name: "Show password",
    }) as HTMLButtonElement;

    expect(input.disabled).toBe(true);
    expect(toggle.disabled).toBe(true);
  });

  it("runs retry once while pending and restores the idle label afterward", async () => {
    const user = userEvent.setup();
    let resolveRetry: (() => void) | undefined;
    const onRetry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        })
    );

    render(<RetryActionButton label="Retry" onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await user.click(screen.getByRole("button", { name: "Retrying..." }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole("button", { name: "Retrying..." }) as HTMLButtonElement)
        .disabled
    ).toBe(true);

    resolveRetry?.();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    });
  });

  it("supports custom pending copy for destructive recovery actions", async () => {
    const user = userEvent.setup();
    let resolveRetry: (() => void) | undefined;
    const onRetry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        })
    );

    render(
      <RetryActionButton
        label="Reconnect"
        onRetry={onRetry}
        pendingLabel="Reconnecting..."
      />
    );

    await user.click(screen.getByRole("button", { name: "Reconnect" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: "Reconnecting..." });

    resolveRetry?.();

    await waitFor(() => {
      screen.getByRole("button", { name: "Reconnect" });
    });
  });

  it("shows retry failures without leaving an unhandled rejection", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn().mockRejectedValue(new Error("Connection failed"));

    render(<RetryActionButton label="Retry" onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Connection failed");
    });
    // The pending label persists briefly past the rejection: the spinner holds
    // for a minimum duration so fast failures are still visibly acknowledged.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    });
  });
});
