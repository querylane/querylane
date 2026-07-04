import { create as createProto } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";

import {
  AppDatabaseStatus_State,
  AppDatabaseStatusSchema,
} from "@/protogen/querylane/console/v1alpha1/console_pb";
import { GetOnboardingStateResponseSchema } from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
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

  it("retryBootstrap re-runs bootstrap flow", async () => {
    let calls = 0;
    const { useSetupStore } = createTestStore(() => {
      calls += 1;
      return Promise.resolve(
        buildOnboardingState({
          isConfigured: true,
          state: AppDatabaseStatus_State.READY,
        })
      );
    });

    await useSetupStore.getState().retryBootstrap();

    expect(calls).toBe(1);
    expect(useSetupStore.getState().status).toBe("ready");
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
