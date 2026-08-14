import { create } from "@bufbuild/protobuf";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerMock = vi.hoisted(() => ({
  invalidate: vi.fn(async () => undefined),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useRouter: () => routerMock,
  };
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouteErrorView } from "@/components/route-error-view";
import { reserveChunkLoadReloadAttempt } from "@/lib/chunk-load-recovery";
import { GetOnboardingStateResponseSchema } from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import { useSetupStore } from "@/stores/setup-store";

const CHUNK_LOAD_ERROR = new Error(
  "Loading chunk 9818 failed.\n(missing: https://demo.querylane.net/static/js/async/9818.55e76f5dd2.js)"
);

function renderRouteErrorView(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
  );
}

beforeEach(() => {
  routerMock.invalidate.mockClear();
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  useSetupStore.setState({
    onboardingState: null,
    showDegradedBanner: false,
  });
});

describe("route error view", () => {
  it("starts one automatic reload for orphaned chunks", () => {
    const reloadPage = vi.fn();

    renderRouteErrorView(
      <RouteErrorView
        error={CHUNK_LOAD_ERROR}
        reloadPage={reloadPage}
        reset={vi.fn()}
      />
    );

    screen.getByRole("heading", { name: "Querylane was updated" });
    screen.getByText(
      "Refreshing now so the latest app files load. If the page does not refresh, use the button below."
    );
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it("uses the app update recovery page after automatic chunk reload was already attempted", () => {
    const reloadPage = vi.fn();

    reserveChunkLoadReloadAttempt({
      error: CHUNK_LOAD_ERROR,
      storage: window.sessionStorage,
    });

    renderRouteErrorView(
      <RouteErrorView
        error={CHUNK_LOAD_ERROR}
        reloadPage={reloadPage}
        reset={vi.fn()}
      />
    );

    screen.getByRole("heading", { name: "Querylane was updated" });
    screen.getByText(
      "Automatic refresh paused to avoid a reload loop. Use the button below to try again."
    );
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it("retries regular route errors by resetting the boundary and invalidating the router", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();

    renderRouteErrorView(
      <RouteErrorView error={new Error("loader failed")} reset={reset} />
    );

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(routerMock.invalidate).toHaveBeenCalledTimes(1));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("offers internal storage recovery from a degraded route error", async () => {
    const user = userEvent.setup();
    useSetupStore.setState({
      onboardingState: create(GetOnboardingStateResponseSchema, {
        configFilePath: "/tmp/querylane/config.yaml",
        isConfigured: true,
      }),
      showDegradedBanner: true,
    });

    renderRouteErrorView(
      <RouteErrorView
        error={new Error("meta database unavailable")}
        reset={vi.fn()}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Reconfigure internal storage" })
    );

    screen.getByRole("heading", { name: "Reconfigure internal storage" });
    screen.getByText("/tmp/querylane/config.yaml");
  });
});
