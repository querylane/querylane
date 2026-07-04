import { createRootRoute, createRouter } from "@tanstack/react-router";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const devtoolsMocks = vi.hoisted(() => ({
  reactQueryDevtools: vi.fn(() => null),
  tanStackRouterDevtools: vi.fn(() => null),
}));

vi.mock("@tanstack/react-query-devtools", () => ({
  ["ReactQueryDevtools"]: devtoolsMocks.reactQueryDevtools,
}));

vi.mock("@tanstack/react-router-devtools", () => ({
  ["TanStackRouterDevtools"]: devtoolsMocks.tanStackRouterDevtools,
}));

afterEach(() => {
  cleanup();
  window.history.pushState(null, "", "/");
});

describe("TanStack devtools integration", () => {
  it("registers query and router devtools", async () => {
    vi.resetModules();
    devtoolsMocks.reactQueryDevtools.mockClear();
    devtoolsMocks.tanStackRouterDevtools.mockClear();

    const { TanStackDevtools } = await import("./tanstack-devtools");
    const rootRoute = createRootRoute();
    const router = createRouter({ routeTree: rootRoute });

    render(<TanStackDevtools router={router} />);

    expect(devtoolsMocks.reactQueryDevtools).toHaveBeenCalled();
    expect(devtoolsMocks.tanStackRouterDevtools).toHaveBeenCalled();
  });
});
