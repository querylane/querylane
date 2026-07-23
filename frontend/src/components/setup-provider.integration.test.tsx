import { create } from "@bufbuild/protobuf";
import {
  ConnectError,
  createRouterTransport,
  type ServiceImpl,
} from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { type SetupContextValue, useSetup } from "@/components/setup-context";
import { SetupProvider } from "@/components/setup-provider";
import {
  AppDatabaseStatus_State,
  AppDatabaseStatusSchema,
} from "@/protogen/querylane/console/v1alpha1/console_pb";
import {
  GetOnboardingStateResponseSchema,
  OnboardingService,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import { markSetupRequired } from "@/stores/setup-required-signal";

type GetOnboardingStateHandler = NonNullable<
  ServiceImpl<typeof OnboardingService>["getOnboardingState"]
>;

const activeQueryClients: QueryClient[] = [];
let setupState: SetupContextValue;

function onboardingResponse(
  isConfigured: boolean,
  state = isConfigured
    ? AppDatabaseStatus_State.READY
    : AppDatabaseStatus_State.NOT_CONFIGURED
) {
  return create(GetOnboardingStateResponseSchema, {
    appDatabaseStatus: create(AppDatabaseStatusSchema, { state }),
    isConfigured,
  });
}

function deferred<T>() {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    reject: rejectPromise,
    resolve: resolvePromise,
  };
}

function SetupStateProbe() {
  setupState = useSetup();
  return (
    <>
      <p>{setupState.status}</p>
      <p>
        configured:
        {setupState.onboardingState?.isConfigured ? "yes" : "no"}
      </p>
    </>
  );
}

function renderSetupProvider(getOnboardingState: GetOnboardingStateHandler) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Number.POSITIVE_INFINITY,
        retry: false,
      },
    },
  });
  activeQueryClients.push(queryClient);
  const transport = createRouterTransport(({ service }) => {
    service(OnboardingService, { getOnboardingState });
  });

  return {
    queryClient,
    ...render(
      <TransportProvider transport={transport}>
        <QueryClientProvider client={queryClient}>
          <SetupProvider>
            <SetupStateProbe />
          </SetupProvider>
        </QueryClientProvider>
      </TransportProvider>
    ),
  };
}

afterEach(() => {
  cleanup();
  for (const queryClient of activeQueryClients) {
    queryClient.clear();
  }
  activeQueryClients.length = 0;
});

describe("SetupProvider bootstrap flow", () => {
  test("starts in booting state", () => {
    const request = deferred<ReturnType<typeof onboardingResponse>>();

    renderSetupProvider(() => request.promise);

    expect(screen.getByText("booting")).toBeTruthy();
  });

  test("routes to ready when configured", async () => {
    const { queryClient } = renderSetupProvider(() => onboardingResponse(true));

    expect(await screen.findByText("ready")).toBeTruthy();
    expect(screen.getByText("configured:yes")).toBeTruthy();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
  });

  test("routes to onboarding when not configured", async () => {
    renderSetupProvider(() => onboardingResponse(false));

    expect(await screen.findByText("onboarding")).toBeTruthy();
    expect(screen.getByText("configured:no")).toBeTruthy();
  });

  test("routes to boot error when the onboarding query fails", async () => {
    renderSetupProvider(() => {
      throw new ConnectError("network down");
    });

    expect(await screen.findByText("boot_error")).toBeTruthy();
    expect(setupState.bootError?.message).toContain("network down");
  });
});

describe("SetupProvider setup-required flow", () => {
  test("refetches onboarding state after a setup-required signal", async () => {
    let requestCount = 0;
    renderSetupProvider(() => {
      requestCount += 1;
      return requestCount === 1
        ? onboardingResponse(true)
        : onboardingResponse(false, AppDatabaseStatus_State.ERROR);
    });
    await screen.findByText("ready");

    act(() => markSetupRequired());

    expect(await screen.findByText("onboarding")).toBeTruthy();
    expect(setupState.onboardingState?.isConfigured).toBe(false);
    expect(setupState.showWizardErrorBanner).toBe(true);
    expect(requestCount).toBe(2);
  });

  test("shows onboarding immediately while the refresh is pending", async () => {
    const refresh = deferred<ReturnType<typeof onboardingResponse>>();
    let requestCount = 0;
    renderSetupProvider(() => {
      requestCount += 1;
      return requestCount === 1 ? onboardingResponse(true) : refresh.promise;
    });
    await screen.findByText("ready");

    act(() => markSetupRequired());

    expect(screen.getByText("onboarding")).toBeTruthy();
    refresh.reject(new ConnectError("refresh failed"));
    expect(await screen.findByText("boot_error")).toBeTruthy();
  });
});

describe("SetupProvider verification flow", () => {
  test("shows verifying and routes to ready when setup is confirmed", async () => {
    const verification = deferred<ReturnType<typeof onboardingResponse>>();
    let requestCount = 0;
    renderSetupProvider(() => {
      requestCount += 1;
      return requestCount === 1
        ? onboardingResponse(false)
        : verification.promise;
    });
    await screen.findByText("onboarding");

    let verificationPromise: Promise<void>;
    act(() => {
      verificationPromise = setupState.verifyAfterSetup();
    });
    expect(screen.getByText("verifying")).toBeTruthy();

    verification.resolve(onboardingResponse(true));
    await act(async () => verificationPromise);

    expect(screen.getByText("ready")).toBeTruthy();
  });

  test("routes back to onboarding when setup remains incomplete", async () => {
    let requestCount = 0;
    renderSetupProvider(() => {
      requestCount += 1;
      return onboardingResponse(false);
    });
    await screen.findByText("onboarding");

    await act(() => setupState.verifyAfterSetup());

    expect(screen.getByText("onboarding")).toBeTruthy();
    expect(requestCount).toBe(2);
  });

  test("routes to boot error when verification fails", async () => {
    let requestCount = 0;
    renderSetupProvider(() => {
      requestCount += 1;
      if (requestCount > 1) {
        throw new ConnectError("verify failed");
      }
      return onboardingResponse(false);
    });
    await screen.findByText("onboarding");

    let verificationError: unknown;
    await act(async () => {
      try {
        await setupState.verifyAfterSetup();
      } catch (error) {
        verificationError = error;
      }
    });

    expect(verificationError).toBeInstanceOf(ConnectError);
    expect(await screen.findByText("boot_error")).toBeTruthy();
    expect(setupState.bootError?.message).toContain("verify failed");
  });
});

describe("SetupProvider request sequencing", () => {
  test("keeps a newer verify response when an older refresh resolves last", async () => {
    const older = deferred<ReturnType<typeof onboardingResponse>>();
    const newer = deferred<ReturnType<typeof onboardingResponse>>();
    let requestCount = 0;
    renderSetupProvider(() => {
      requestCount += 1;
      if (requestCount === 1) {
        return onboardingResponse(false);
      }
      return requestCount === 2 ? older.promise : newer.promise;
    });
    await screen.findByText("onboarding");

    let olderRefresh: Promise<void>;
    let newerVerify: Promise<void>;
    act(() => {
      olderRefresh = setupState.refreshOnboardingState();
      newerVerify = setupState.verifyAfterSetup();
    });
    newer.resolve(onboardingResponse(true));
    await act(async () => newerVerify);
    older.resolve(onboardingResponse(false));
    await act(async () => Promise.allSettled([olderRefresh]));

    expect(setupState.status).toBe("ready");
    expect(setupState.onboardingState?.isConfigured).toBe(true);
  });

  test("keeps a newer setup-required response when verification resolves last", async () => {
    const older = deferred<ReturnType<typeof onboardingResponse>>();
    const newer = deferred<ReturnType<typeof onboardingResponse>>();
    let requestCount = 0;
    renderSetupProvider(() => {
      requestCount += 1;
      if (requestCount === 1) {
        return onboardingResponse(false);
      }
      return requestCount === 2 ? older.promise : newer.promise;
    });
    await screen.findByText("onboarding");

    let olderVerify: Promise<void>;
    act(() => {
      olderVerify = setupState.verifyAfterSetup();
      markSetupRequired();
    });
    newer.resolve(onboardingResponse(false));
    await waitFor(() => expect(requestCount).toBe(3));
    older.resolve(onboardingResponse(true));
    await act(async () => Promise.allSettled([olderVerify]));

    expect(setupState.status).toBe("onboarding");
    expect(setupState.onboardingState?.isConfigured).toBe(false);
  });

  test("ignores an older failure after a newer request succeeds", async () => {
    const older = deferred<ReturnType<typeof onboardingResponse>>();
    const newer = deferred<ReturnType<typeof onboardingResponse>>();
    let requestCount = 0;
    renderSetupProvider(() => {
      requestCount += 1;
      if (requestCount === 1) {
        return onboardingResponse(false);
      }
      return requestCount === 2 ? older.promise : newer.promise;
    });
    await screen.findByText("onboarding");

    let olderRefresh: Promise<void>;
    let newerVerify: Promise<void>;
    act(() => {
      olderRefresh = setupState.refreshOnboardingState();
      newerVerify = setupState.verifyAfterSetup();
    });
    newer.resolve(onboardingResponse(true));
    await act(async () => newerVerify);
    older.reject(new ConnectError("older failure"));
    await act(async () => Promise.allSettled([olderRefresh]));

    expect(setupState.status).toBe("ready");
    expect(setupState.bootError).toBeNull();
  });
});

test("records warning codes for inconsistent configured state", async () => {
  renderSetupProvider(() =>
    onboardingResponse(true, AppDatabaseStatus_State.NOT_CONFIGURED)
  );

  await screen.findByText("ready");

  expect(setupState.warningCode).toBe(
    "INCONSISTENT_NOT_CONFIGURED_WHILE_CONFIGURED"
  );
});
