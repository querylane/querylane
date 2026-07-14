import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouteProgressBar } from "@/components/route-progress-bar";

const routerState = vi.hoisted(() => ({
  isLoading: false,
  isTransitioning: false,
  status: "idle" as "idle" | "pending",
}));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({
    select,
  }: {
    select?: (state: typeof routerState) => unknown;
  } = {}) => (select ? select(routerState) : routerState),
}));

describe("RouteProgressBar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    routerState.isLoading = false;
    routerState.isTransitioning = false;
    routerState.status = "idle";
    vi.useRealTimers();
  });

  it("stays hidden when the router is idle", () => {
    render(<RouteProgressBar />);

    expect(screen.queryByTestId("route-progress-bar")).toBeNull();
    expect(screen.queryByText("Loading page")).toBeNull();
  });

  it("waits briefly before rendering loading route progress", () => {
    routerState.isLoading = true;

    render(<RouteProgressBar />);

    expect(screen.queryByTestId("route-progress-bar")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(199);
    });

    expect(screen.queryByTestId("route-progress-bar")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    const progressbar = screen.getByTestId("route-progress-bar");
    const fill = progressbar.firstElementChild;

    expect(progressbar.getAttribute("aria-hidden")).toBe("true");
    expect(progressbar.className).toContain("absolute");
    expect(progressbar.className).toContain("top-0");
    expect(progressbar.className).toContain("z-50");
    expect(fill?.className).toContain("route-progress-bar-fill");
    expect(fill?.className).toContain("w-1/3");
    expect(screen.getByText("Loading page")).toBeTruthy();
  });

  it("stays hidden when a route resolves before the delay finishes", () => {
    routerState.isLoading = true;

    const { rerender } = render(<RouteProgressBar />);

    act(() => {
      vi.advanceTimersByTime(199);
    });

    routerState.isLoading = false;
    rerender(<RouteProgressBar />);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.queryByTestId("route-progress-bar")).toBeNull();
  });

  it("keeps the indicator visible for a minimum duration", () => {
    routerState.isLoading = true;

    const { rerender } = render(<RouteProgressBar />);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByTestId("route-progress-bar")).toBeTruthy();

    routerState.isLoading = false;
    rerender(<RouteProgressBar />);

    act(() => {
      vi.advanceTimersByTime(399);
    });

    expect(screen.getByTestId("route-progress-bar")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.queryByTestId("route-progress-bar")).toBeNull();
  });

  it("ignores non-loading transition state", () => {
    routerState.status = "pending";
    routerState.isTransitioning = true;

    render(<RouteProgressBar />);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByTestId("route-progress-bar")).toBeNull();
  });
});
