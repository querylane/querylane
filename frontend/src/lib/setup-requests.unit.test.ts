import { create } from "@bufbuild/protobuf";
import { expect, test } from "@rstest/core";
import {
  SetupAppDatabaseResponseSchema,
  SetupStep,
  StepState,
  WatchConfigChangesResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import {
  consumeSetupStreamWithProgress,
  consumeWatchStreamWithProgress,
} from "./setup-requests";

test("a closed setup stream is not success before configuration is persisted", async () => {
  const acknowledged = Promise.withResolvers<void>();

  async function* stream() {
    yield create(SetupAppDatabaseResponseSchema, {
      event: {
        state: StepState.SUCCEEDED,
        stepId: SetupStep.INITIALIZING_SERVICES,
      },
    });
    await acknowledged.promise;
  }

  await expect(
    consumeSetupStreamWithProgress(stream(), () => {
      acknowledged.resolve();
    })
  ).rejects.toThrow("Database setup stream ended before setup completed");
});

test("watch progress retains a failure after initialization appeared to succeed", async () => {
  const initialized = Promise.withResolvers<void>();
  const progress: StepState[] = [];

  async function* stream() {
    yield create(WatchConfigChangesResponseSchema, {
      event: {
        displayName: "Initializing services",
        state: StepState.SUCCEEDED,
        stepId: SetupStep.INITIALIZING_SERVICES,
      },
    });
    await initialized.promise;
    yield create(WatchConfigChangesResponseSchema, {
      event: {
        displayName: "Connecting",
        error: "late failure",
        state: StepState.FAILED,
      },
    });
  }

  const failure = await consumeWatchStreamWithProgress(stream(), (event) => {
    progress.push(event.state);
    initialized.resolve();
  });

  expect(progress).toEqual([StepState.SUCCEEDED, StepState.FAILED]);
  expect(failure).toMatchObject({ message: "late failure" });
});
