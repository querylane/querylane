import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RouteAnnouncer } from "@/components/route-announcer";

const ROLE = "status";

const { useLocationMock } = vi.hoisted(() => ({
  useLocationMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useLocation: useLocationMock,
}));

describe("RouteAnnouncer", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("renders a live region with role=status and aria-live=polite", () => {
    useLocationMock.mockImplementation(
      ({ select }: { select: (l: { pathname: string }) => string }) =>
        select({ pathname: "/" })
    );

    render(<RouteAnnouncer />);

    const region = screen.getByRole(ROLE);
    expect(region.getAttribute("aria-live")).toBe("polite");
  });

  test("announces the home page label on the root pathname", () => {
    useLocationMock.mockImplementation(
      ({ select }: { select: (l: { pathname: string }) => string }) =>
        select({ pathname: "/" })
    );

    render(<RouteAnnouncer />);

    expect(screen.getByRole(ROLE).textContent).toBe("Home");
  });

  test("announces a page name when navigating to setup", () => {
    useLocationMock.mockImplementation(
      ({ select }: { select: (l: { pathname: string }) => string }) =>
        select({ pathname: "/setup" })
    );

    render(<RouteAnnouncer />);

    expect(screen.getByRole(ROLE).textContent).toBe("Setup");
  });

  test("announces the database extensions route", () => {
    useLocationMock.mockImplementation(
      ({ select }: { select: (l: { pathname: string }) => string }) =>
        select({ pathname: "/instances/prod/databases/app/extensions" })
    );

    render(<RouteAnnouncer />);

    expect(screen.getByRole(ROLE).textContent).toBe("Extensions");
  });

  test("updates the live region when the pathname changes", async () => {
    let pathname = "/";
    useLocationMock.mockImplementation(
      ({ select }: { select: (l: { pathname: string }) => string }) =>
        select({ pathname })
    );

    const { rerender } = render(<RouteAnnouncer />);
    expect(screen.getByRole(ROLE).textContent).toBe("Home");

    pathname = "/setup";
    useLocationMock.mockImplementation(
      ({ select }: { select: (l: { pathname: string }) => string }) =>
        select({ pathname })
    );
    rerender(<RouteAnnouncer />);

    await waitFor(() => {
      expect(screen.getByRole(ROLE).textContent).toBe("Setup");
    });
  });
});
