import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseLayout } from "@/components/database-layout";
import { useSetupStore } from "@/stores/setup-store";

const routerState = vi.hoisted(() => ({
  isLoading: false,
  pathname: "/instances/prod",
}));

vi.mock("@tanstack/react-router", () => {
  function MockCatchBoundary({ children }: { children: React.ReactNode }) {
    return children;
  }

  return {
    ...Object.fromEntries([["CatchBoundary", MockCatchBoundary]]),
    useLocation: ({
      select,
    }: {
      select?: (location: { href: string; pathname: string }) => unknown;
    } = {}) => {
      const location = {
        href: routerState.pathname,
        pathname: routerState.pathname,
      };
      return select ? select(location) : location;
    },
    useRouterState: ({
      select,
    }: {
      select?: (state: {
        isLoading: boolean;
        location: { pathname: string };
      }) => unknown;
    } = {}) => {
      const state = {
        isLoading: routerState.isLoading,
        location: { pathname: routerState.pathname },
      };
      return select ? select(state) : state;
    },
  };
});

vi.mock("@/components/admin-header", () => {
  function MockAdminHeader() {
    return <header data-testid="admin-header" />;
  }

  return Object.fromEntries([["AdminHeader", MockAdminHeader]]);
});

vi.mock("@/components/admin-keyboard-shortcuts", () => {
  function MockAdminKeyboardShortcuts() {
    return null;
  }

  return Object.fromEntries([
    ["AdminKeyboardShortcuts", MockAdminKeyboardShortcuts],
  ]);
});

vi.mock("@/components/app-sidebar", () => {
  function MockAppSidebar() {
    return <aside data-testid="app-sidebar" />;
  }

  return Object.fromEntries([["AppSidebar", MockAppSidebar]]);
});

describe("DatabaseLayout route transitions", () => {
  beforeEach(() => {
    routerState.isLoading = false;
    routerState.pathname = "/instances/prod";
    useSetupStore.setState({ showDegradedBanner: false });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders the instance shell while the target route stays in instance scope", async () => {
    render(
      <DatabaseLayout>
        <div>Instance content</div>
      </DatabaseLayout>
    );

    expect(await screen.findByTestId("app-sidebar")).toBeTruthy();
    expect(screen.getByText("Instance content")).toBeTruthy();
  });

  it("keeps the previous instance shell while the target route leaves instance scope", async () => {
    routerState.pathname = "/new-instance";

    render(
      <DatabaseLayout>
        <div>Stale instance content</div>
      </DatabaseLayout>
    );

    expect(await screen.findByTestId("app-sidebar")).toBeTruthy();
    expect(screen.getByText("Stale instance content")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Loading" })).toBeNull();
  });

  it("mounts route progress inside the content inset", () => {
    vi.useFakeTimers();
    routerState.isLoading = true;

    render(
      <DatabaseLayout>
        <div>Instance content</div>
      </DatabaseLayout>
    );

    expect(screen.queryByTestId("route-progress-bar")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    const progressbar = screen.getByTestId("route-progress-bar");

    expect(progressbar.className).toContain("absolute");
    expect(progressbar.className).toContain("top-0");
  });
});
