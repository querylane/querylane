import { afterEach, expect, test } from "@rstest/core";
import { http } from "msw";
import { AppDatabaseStatus_State } from "@/protogen/querylane/console/v1alpha1/console_pb";
import { OnboardingService } from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import {
  rpcJson,
  rpcPath,
  setupRpcServer,
  unaryRpc,
} from "@/test/connect.test-utils";
import { useSetupStore } from "./setup-store";

const server = setupRpcServer();

afterEach(() => {
  useSetupStore.setState(useSetupStore.getInitialState(), true);
});

test.each([
  { fails: false, outcome: "success" },
  { fails: true, outcome: "failure" },
])(
  "an older onboarding $outcome cannot undo a verified setup",
  async ({ fails }) => {
    const started = Promise.withResolvers<void>();
    const releaseStale = Promise.withResolvers<void>();
    const method = OnboardingService.method.getOnboardingState;
    server.use(
      http.post(rpcPath(method), async () => {
        started.resolve();
        await releaseStale.promise;
        return fails
          ? rpcJson({ code: "unavailable", message: "Stale check failed" }, 503)
          : rpcJson({
              appDatabaseStatus: { state: "STATE_NOT_CONFIGURED" },
              isConfigured: false,
            });
      })
    );

    const stale = useSetupStore.getState().refreshOnboardingState();

    try {
      await started.promise;
      server.use(
        unaryRpc(method, () => ({
          appDatabaseStatus: { state: AppDatabaseStatus_State.READY },
          isConfigured: true,
        }))
      );
      await useSetupStore.getState().verifyAfterSetup();
      expect(useSetupStore.getState().status).toBe("ready");
    } finally {
      releaseStale.resolve();
      await stale;
    }

    expect(useSetupStore.getState()).toMatchObject({
      bootError: null,
      onboardingState: { isConfigured: true },
      status: "ready",
    });
  }
);
