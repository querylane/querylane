import { create } from "@bufbuild/protobuf";
import { afterEach, beforeEach, describe, expect, it, rs } from "@rstest/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatabaseLayout } from "@/components/database-layout";
import { GetOnboardingStateResponseSchema } from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import { useSetupStore } from "@/stores/setup-store";

const routerState = rs.hoisted(() => ({
  isLoading: false,
  pathname: "/instances/prod",
}));
const PRESERVES_SETTINGS_RE =
  /creates a backup and preserves your other settings/i;

rs.mock("@tanstack/react-router", () => {
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

rs.mock("@/components/admin-header", () => {
  function MockAdminHeader() {
    return <header data-testid="admin-header" />;
  }

  return Object.fromEntries([["AdminHeader", MockAdminHeader]]);
});

rs.mock("@/components/admin-keyboard-shortcuts", () => {
  function MockAdminKeyboardShortcuts() {
    return null;
  }

  return Object.fromEntries([
    ["AdminKeyboardShortcuts", MockAdminKeyboardShortcuts],
  ]);
});

rs.mock("@/components/app-sidebar", () => {
  function MockAppSidebar() {
    return <aside data-testid="app-sidebar" />;
  }

  return Object.fromEntries([["AppSidebar", MockAppSidebar]]);
});

describe("DatabaseLayout route transitions", () => {
  beforeEach(() => {
    routerState.isLoading = false;
    routerState.pathname = "/instances/prod";
    useSetupStore.setState({
      onboardingState: null,
      showDegradedBanner: false,
    });
  });

  afterEach(() => {
    cleanup();
    rs.useRealTimers();
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
    rs.useFakeTimers();
    routerState.isLoading = true;

    render(
      <DatabaseLayout>
        <div>Instance content</div>
      </DatabaseLayout>
    );

    expect(screen.queryByTestId("route-progress-bar")).toBeNull();

    act(() => {
      rs.advanceTimersByTime(200);
    });

    const progressbar = screen.getByTestId("route-progress-bar");

    expect(progressbar.className).toContain("absolute");
    expect(progressbar.className).toContain("top-0");
  });

  it("links degraded mode to internal storage recovery instructions", async () => {
    const user = userEvent.setup();
    useSetupStore.setState({
      onboardingState: create(GetOnboardingStateResponseSchema, {
        configFilePath: "/tmp/querylane/config.yaml",
        isConfigured: true,
      }),
      showDegradedBanner: true,
    });

    render(
      <DatabaseLayout>
        <div>Instance content</div>
      </DatabaseLayout>
    );

    await user.click(
      screen.getByRole("button", { name: "Reconfigure internal storage" })
    );

    expect(
      screen.getByRole("heading", { name: "Reconfigure internal storage" })
    ).toBeTruthy();
    expect(screen.getByText("/tmp/querylane/config.yaml")).toBeTruthy();
    expect(
      screen.getByText(
        "querylane server reset-config --config '/tmp/querylane/config.yaml'"
      )
    ).toBeTruthy();
    expect(screen.getByText(PRESERVES_SETTINGS_RE)).toBeTruthy();
  });
});
