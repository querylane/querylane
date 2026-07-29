import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, test, vi } from "vitest";

import { ChunkLoadRecoveryPage } from "@/components/chunk-load-recovery-page";

afterEach(() => {
  cleanup();
});

describe("chunk load recovery page", () => {
  it("explains the automatic refresh while it is reloading", () => {
    render(<ChunkLoadRecoveryPage autoReloading={true} />);

    screen.getByRole("heading", { name: "Querylane was updated" });
    screen.getByText(
      "Refreshing now so the latest app files load. If the page does not refresh, use the button below."
    );
  });

  it("keeps a manual refresh after automatic recovery pauses", async () => {
    const user = userEvent.setup();
    const reloadPage = vi.fn();

    render(<ChunkLoadRecoveryPage reloadPage={reloadPage} />);

    screen.getByText(
      "Automatic refresh paused to avoid a reload loop. Use the button below to try again."
    );

    await user.click(screen.getByRole("button", { name: "Refresh now" }));

    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  // This page replaces the whole app shell, so it must track the dynamic
  // viewport height instead of `vh`, which mobile browser toolbars overlap.
  test("sizes the recovery shell against the dynamic viewport", () => {
    render(<ChunkLoadRecoveryPage />);

    const shell = screen.getByRole("main");
    expect(shell.className).toContain("min-h-dvh");
    expect(shell.className).not.toContain("min-h-screen");
  });
});
