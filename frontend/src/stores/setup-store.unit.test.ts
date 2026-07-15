import { create as createProto } from "@bufbuild/protobuf";
import { describe, expect, it, vi } from "vitest";

import {
  AppDatabaseStatus_State,
  AppDatabaseStatusSchema,
} from "@/protogen/querylane/console/v1alpha1/console_pb";
import {
  type GetOnboardingStateResponse,
  GetOnboardingStateResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import {
  createSetupStore,
  type SetupStoreDependencies,
} from "@/stores/setup-store";

function buildOnboardingState({
  isConfigured,
  state,
}: {
  isConfigured: boolean;
  state: AppDatabaseStatus_State;
}) {
  return createProto(GetOnboardingStateResponseSchema, {
    appDatabaseStatus: createProto(AppDatabaseStatusSchema, {
      state,
    }),
    isConfigured,
  });
}

function createTestStore(
  getOnboardingState: SetupStoreDependencies["onboardingClient"]["getOnboardingState"]
) {
  const dependencies: SetupStoreDependencies = {
    onboardingClient: {
      getOnboardingState,
    },
  };

  return {
    useSetupStore: createSetupStore(dependencies),
  };
}

function createInterleavedTestStore() {
  const olderRequest = Promise.withResolvers<GetOnboardingStateResponse>();
  const newerRequest = Promise.withResolvers<GetOnboardingStateResponse>();
  const { useSetupStore } = createTestStore(
    vi
      .fn()
      .mockReturnValueOnce(olderRequest.promise)
      .mockReturnValueOnce(newerRequest.promise)
  );

  return { newerRequest, olderRequest, useSetupStore };
}

describe("setup-store bootstrap flow", () => {
  it("initializes in booting state", () => {
    const { useSetupStore } = createTestStore(() =>
      Promise.resolve(
        buildOnboardingState({
          isConfigured: false,
          state: AppDatabaseStatus_State.NOT_CONFIGURED,
        })
      )
    );

    expect(useSetupStore.getState().status).toBe("booting");
    expect(useSetupStore.getState().onboardingState).toBeNull();
  });

  it("bootstrap routes to ready when configured", async () => {
    const { useSetupStore } = createTestStore(() =>
      Promise.resolve(
        buildOnboardingState({
          isConfigured: true,
          state: AppDatabaseStatus_State.READY,
        })
      )
    );

    await useSetupStore.getState().bootstrap();

    expect(useSetupStore.getState().status).toBe("ready");
    expect(useSetupStore.getState().showDegradedBanner).toBe(false);
  });

  it("bootstrap routes to onboarding when not configured", async () => {
    const { useSetupStore } = createTestStore(() =>
      Promise.resolve(
        buildOnboardingState({
          isConfigured: false,
          state: AppDatabaseStatus_State.NOT_CONFIGURED,
        })
      )
    );

    await useSetupStore.getState().bootstrap();

    expect(useSetupStore.getState().status).toBe("onboarding");
    expect(useSetupStore.getState().showWizardErrorBanner).toBe(false);
  });

  it("bootstrap routes to boot_error on network failure", async () => {
    const failure = new Error("network down");
    const { useSetupStore } = createTestStore(() => Promise.reject(failure));

    await useSetupStore.getState().bootstrap();

    expect(useSetupStore.getState().status).toBe("boot_error");
    expect(useSetupStore.getState().bootError?.message).toBe("network down");
  });
});

describe("setup-store setup-required transition", () => {
  it("setSetupRequired clears snapshot and refreshes onboarding state", async () => {
    const { useSetupStore } = createTestStore(() =>
      Promise.resolve(
        buildOnboardingState({
          isConfigured: false,
          state: AppDatabaseStatus_State.ERROR,
        })
      )
    );

    useSetupStore.setState({
      onboardingState: buildOnboardingState({
        isConfigured: true,
        state: AppDatabaseStatus_State.READY,
      }),
      status: "ready",
    });

    useSetupStore.getState().setSetupRequired();
    await Promise.resolve();

    expect(useSetupStore.getState().status).toBe("onboarding");
    expect(useSetupStore.getState().onboardingState?.isConfigured).toBe(false);
    expect(useSetupStore.getState().showWizardErrorBanner).toBe(true);
  });
});

describe("setup-store verify flow", () => {
  it("verifyAfterSetup routes to ready when confirmed configured", async () => {
    const { useSetupStore } = createTestStore(() =>
      Promise.resolve(
        buildOnboardingState({
          isConfigured: true,
          state: AppDatabaseStatus_State.READY,
        })
      )
    );

    await useSetupStore.getState().verifyAfterSetup();

    expect(useSetupStore.getState().status).toBe("ready");
  });

  it("verifyAfterSetup routes back to onboarding when not configured", async () => {
    const { useSetupStore } = createTestStore(() =>
      Promise.resolve(
        buildOnboardingState({
          isConfigured: false,
          state: AppDatabaseStatus_State.NOT_CONFIGURED,
        })
      )
    );

    await useSetupStore.getState().verifyAfterSetup();

    expect(useSetupStore.getState().status).toBe("onboarding");
  });

  it("verifyAfterSetup routes to boot_error on failure", async () => {
    const failure = new Error("verify failed");
    const { useSetupStore } = createTestStore(() => Promise.reject(failure));

    await useSetupStore.getState().verifyAfterSetup();

    expect(useSetupStore.getState().status).toBe("boot_error");
    expect(useSetupStore.getState().bootError?.message).toBe("verify failed");
  });
});

describe("setup-store request sequencing", () => {
  it("keeps a newer verify response when an older refresh resolves last", async () => {
    const { newerRequest, olderRequest, useSetupStore } =
      createInterleavedTestStore();

    const olderRefresh = useSetupStore.getState().refreshOnboardingState();
    const newerVerify = useSetupStore.getState().verifyAfterSetup();

    newerRequest.resolve(
      buildOnboardingState({
        isConfigured: true,
        state: AppDatabaseStatus_State.READY,
      })
    );
    await newerVerify;
    expect(useSetupStore.getState().status).toBe("ready");

    olderRequest.resolve(
      buildOnboardingState({
        isConfigured: false,
        state: AppDatabaseStatus_State.NOT_CONFIGURED,
      })
    );
    await olderRefresh;

    expect(useSetupStore.getState().status).toBe("ready");
    expect(useSetupStore.getState().onboardingState?.isConfigured).toBe(true);
  });

  it("keeps a newer setup-required response when an older verify resolves last", async () => {
    const { newerRequest, olderRequest, useSetupStore } =
      createInterleavedTestStore();

    const olderVerify = useSetupStore.getState().verifyAfterSetup();
    useSetupStore.getState().setSetupRequired();

    newerRequest.resolve(
      buildOnboardingState({
        isConfigured: false,
        state: AppDatabaseStatus_State.NOT_CONFIGURED,
      })
    );
    await vi.waitFor(() => {
      expect(useSetupStore.getState().onboardingState?.isConfigured).toBe(
        false
      );
    });

    olderRequest.resolve(
      buildOnboardingState({
        isConfigured: true,
        state: AppDatabaseStatus_State.READY,
      })
    );
    await olderVerify;

    expect(useSetupStore.getState().status).toBe("onboarding");
    expect(useSetupStore.getState().onboardingState?.isConfigured).toBe(false);
  });

  it("ignores an older failure after a newer request succeeds", async () => {
    const { newerRequest, olderRequest, useSetupStore } =
      createInterleavedTestStore();

    const olderRefresh = useSetupStore.getState().refreshOnboardingState();
    const newerVerify = useSetupStore.getState().verifyAfterSetup();

    newerRequest.resolve(
      buildOnboardingState({
        isConfigured: true,
        state: AppDatabaseStatus_State.READY,
      })
    );
    await newerVerify;

    olderRequest.reject(new Error("stale failure"));
    await olderRefresh;

    expect(useSetupStore.getState().status).toBe("ready");
    expect(useSetupStore.getState().bootError).toBeNull();
  });
});

it("records warning codes for inconsistent configured state", async () => {
  const { useSetupStore } = createTestStore(() =>
    Promise.resolve(
      buildOnboardingState({
        isConfigured: true,
        state: AppDatabaseStatus_State.NOT_CONFIGURED,
      })
    )
  );

  await useSetupStore.getState().bootstrap();

  expect(useSetupStore.getState().warningCode).toBe(
    "INCONSISTENT_NOT_CONFIGURED_WHILE_CONFIGURED"
  );
});

it("setSetupRequired swallows async refresh rejections", async () => {
  const { useSetupStore } = createTestStore(() =>
    Promise.resolve(
      buildOnboardingState({
        isConfigured: false,
        state: AppDatabaseStatus_State.NOT_CONFIGURED,
      })
    )
  );
  useSetupStore.setState({
    refreshOnboardingState: () => Promise.reject(new Error("refresh failed")),
  });

  expect(() => useSetupStore.getState().setSetupRequired()).not.toThrow();
  await Promise.resolve();

  expect(useSetupStore.getState().status).toBe("onboarding");
});
