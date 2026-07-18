import { createRootRoute, createRouter } from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const devtoolsMocks = vi.hoisted(() => ({
  reactQueryDevtools: vi.fn(() => null),
  tanStackRouterDevtools: vi.fn(() => null),
}));

vi.mock("@tanstack/react-query-devtools", () => ({
  ReactQueryDevtools: devtoolsMocks.reactQueryDevtools,
}));

vi.mock("@tanstack/react-router-devtools", () => ({
  TanStackRouterDevtools: devtoolsMocks.tanStackRouterDevtools,
}));

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.history.pushState(null, "", "/");
});

describe("TanStack devtools integration", () => {
  it("keeps devtools unmounted until the launcher is clicked", async () => {
    vi.resetModules();
    devtoolsMocks.reactQueryDevtools.mockClear();
    devtoolsMocks.tanStackRouterDevtools.mockClear();

    const { TanStackDevtools } = await import("./tanstack-devtools");
    const rootRoute = createRootRoute();
    const router = createRouter({ routeTree: rootRoute });

    render(<TanStackDevtools router={router} />);

    expect(devtoolsMocks.reactQueryDevtools).not.toHaveBeenCalled();
    expect(devtoolsMocks.tanStackRouterDevtools).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "TanStack devtools" })
    );

    expect(devtoolsMocks.reactQueryDevtools).toHaveBeenCalled();
    expect(devtoolsMocks.tanStackRouterDevtools).toHaveBeenCalled();
  });

  it("restores devtools across reloads within the same tab session", async () => {
    vi.resetModules();
    devtoolsMocks.reactQueryDevtools.mockClear();
    devtoolsMocks.tanStackRouterDevtools.mockClear();
    window.sessionStorage.setItem("querylane-devtools-mounted", "1");

    const { TanStackDevtools } = await import("./tanstack-devtools");
    const rootRoute = createRootRoute();
    const router = createRouter({ routeTree: rootRoute });

    render(<TanStackDevtools router={router} />);

    expect(devtoolsMocks.reactQueryDevtools).toHaveBeenCalled();
    expect(devtoolsMocks.tanStackRouterDevtools).toHaveBeenCalled();
  });
});
