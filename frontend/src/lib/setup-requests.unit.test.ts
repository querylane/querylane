import { create as createProto } from "@bufbuild/protobuf";
import { describe, expect, it } from "@rstest/core";

import { PostgresConfigSchema } from "@/protogen/querylane/console/v1alpha1/instance_pb";
import {
  SetupAppDatabaseResponseSchema,
  SetupProgressEventSchema,
  SetupStep,
  StepState,
  WatchConfigChangesResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";

import {
  buildConnectionTestRequest,
  buildSetupAppDatabaseRequest,
  consumeSetupStreamWithProgress,
  consumeWatchStreamWithProgress,
  createSetupStreamFailureError,
} from "./setup-requests";

function buildPostgresConfig() {
  return createProto(PostgresConfigSchema, {
    database: "querylane",
    host: "localhost",
    password: "secret",
    port: 5432,
    username: "querylane",
  });
}

function buildSetupResponse({
  state,
  error = "",
  displayName = "",
  stepId = SetupStep.UNSPECIFIED,
}: {
  state: StepState;
  error?: string;
  displayName?: string;
  stepId?: SetupStep;
}) {
  return createProto(SetupAppDatabaseResponseSchema, {
    event: createProto(SetupProgressEventSchema, {
      displayName,
      error,
      state,
      stepId,
    }),
  });
}

function buildSucceededSetupResponse(stepId: SetupStep) {
  return buildSetupResponse({
    state: StepState.SUCCEEDED,
    error: "",
    displayName: "",
    stepId,
  });
}

function buildWatchResponse(
  state: StepState,
  error = "",
  options: { displayName?: string; stepId?: SetupStep } = {}
) {
  return createProto(WatchConfigChangesResponseSchema, {
    event: createProto(SetupProgressEventSchema, {
      displayName: options.displayName ?? "",
      error,
      state,
      stepId: options.stepId ?? SetupStep.UNSPECIFIED,
    }),
  });
}

function buildAsyncStream<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;

      return {
        next: () => {
          const isDone = index >= items.length;
          const item = items[index];
          index += 1;
          return Promise.resolve(
            isDone
              ? { done: true as const, value: undefined }
              : { done: false as const, value: item as T }
          );
        },
      };
    },
  };
}

function createControlledAsyncStream<T>() {
  const queue: T[] = [];
  let isClosed = false;
  let wakeReader: ((result: IteratorResult<T>) => void) | null = null;

  const readNext = (): Promise<IteratorResult<T>> => {
    if (queue.length > 0) {
      return Promise.resolve({ done: false, value: queue.shift() as T });
    }

    if (isClosed) {
      return Promise.resolve({ done: true, value: undefined });
    }

    return new Promise((resolve) => {
      wakeReader = resolve;
    });
  };

  return {
    close: () => {
      isClosed = true;
      const reader = wakeReader;
      wakeReader = null;
      reader?.({ done: true, value: undefined });
    },
    push: (item: T) => {
      const reader = wakeReader;
      wakeReader = null;
      if (reader) {
        reader({ done: false, value: item });
        return;
      }
      queue.push(item);
    },
    stream: {
      [Symbol.asyncIterator]() {
        return { next: readNext };
      },
    } as AsyncIterable<T>,
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("setup request builders", () => {
  it("builds standalone connection test requests", () => {
    const config = buildPostgresConfig();

    const request = buildConnectionTestRequest(config);

    expect(request.config?.database).toBe("querylane");
    expect(request.config?.host).toBe("localhost");
  });

  it("builds setup requests with postgres config payload", () => {
    const config = buildPostgresConfig();

    const request = buildSetupAppDatabaseRequest(config);

    expect(request.setup.case).toBe("postgresConfig");
    if (request.setup.case !== "postgresConfig") {
      throw new Error("Expected postgresConfig setup payload");
    }
    expect(request.setup.value.database).toBe("querylane");
  });
});

describe("setup stream consumption", () => {
  it("rejects when the stream closes before config persistence succeeds", async () => {
    const stream = buildAsyncStream([
      buildSucceededSetupResponse(SetupStep.INITIALIZING_SERVICES),
    ]);

    await expect(
      consumeSetupStreamWithProgress(stream, () => undefined)
    ).rejects.toThrow("Database setup stream ended before setup completed");
  });

  it("consumes setup stream and returns the last failure message", async () => {
    const responses = [
      buildSetupResponse({ state: StepState.IN_PROGRESS }),
      buildSetupResponse({ state: StepState.FAILED, error: "first" }),
      buildSetupResponse({ state: StepState.FAILED, error: "second" }),
    ];
    const stream = buildAsyncStream(responses);

    await expect(
      consumeSetupStreamWithProgress(stream, () => undefined)
    ).resolves.toMatchObject({
      message: "second",
    });
  });

  it("invokes progress callback in order for async-delayed setup events", async () => {
    const controlled =
      createControlledAsyncStream<ReturnType<typeof buildSetupResponse>>();
    const states: StepState[] = [];

    const consumePromise = consumeSetupStreamWithProgress(
      controlled.stream,
      (event) => {
        states.push(event.state);
      }
    );

    await flushMicrotasks();
    expect(states).toEqual([]);

    controlled.push(buildSetupResponse({ state: StepState.PENDING }));
    await flushMicrotasks();
    expect(states).toEqual([StepState.PENDING]);

    controlled.push(buildSetupResponse({ state: StepState.IN_PROGRESS }));
    await flushMicrotasks();
    expect(states).toEqual([StepState.PENDING, StepState.IN_PROGRESS]);

    controlled.push(buildSucceededSetupResponse(SetupStep.PERSISTING_CONFIG));
    await flushMicrotasks();
    expect(states).toEqual([
      StepState.PENDING,
      StepState.IN_PROGRESS,
      StepState.SUCCEEDED,
    ]);

    controlled.close();
    await expect(consumePromise).resolves.toBeNull();
  });
});

describe("watch stream consumption", () => {
  it("keeps a failure that arrives after initialization succeeded", async () => {
    const responses = [
      buildWatchResponse(StepState.SUCCEEDED, "", {
        displayName: "Initializing services",
        stepId: SetupStep.INITIALIZING_SERVICES,
      }),
      buildWatchResponse(StepState.FAILED, "late failure", {
        displayName: "Connecting",
      }),
    ];

    const failure = await consumeWatchStreamWithProgress(
      buildAsyncStream(responses),
      () => undefined
    );

    expect(failure).toMatchObject({ message: "late failure" });
  });
});

describe("setup stream errors", () => {
  it("creates setup stream failure errors with attached failed event", () => {
    const failedEvent = createProto(SetupProgressEventSchema, {
      displayName: "Apply migrations",
      error: "migration failed",
      state: StepState.FAILED,
    });

    const error = createSetupStreamFailureError({
      failedEvent,
      message: "migration failed",
    });

    expect(error.message).toBe("migration failed");
    expect(error.failedEvent).toBe(failedEvent);
  });
});
