import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { BrandedLoadingState } from "@/components/branded-loading-state";

afterEach(() => {
  cleanup();
});

describe("branded loading state", () => {
  // The fullscreen variant is the whole viewport, so it must track the dynamic
  // viewport height instead of `vh`, which mobile browser toolbars overlap.
  test("sizes the fullscreen variant against the dynamic viewport", () => {
    render(
      <BrandedLoadingState title="Loading Querylane" variant="fullscreen" />
    );

    const container = screen.getByTestId("branded-loading-state");
    expect(container.className).toContain("min-h-dvh");
    expect(container.className).not.toContain("min-h-screen");
  });

  test("keeps the section variant sized to its own block", () => {
    render(<BrandedLoadingState title="Loading databases" variant="section" />);

    const container = screen.getByTestId("branded-loading-state");
    expect(container.className).toContain("min-h-[40vh]");
    expect(container.className).not.toContain("min-h-dvh");
    expect(
      screen.getByRole("heading", { name: "Loading databases" })
    ).toBeTruthy();
  });
});
