import { create as createProto } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";

import { PostgresConfigSchema } from "@/protogen/querylane/console/v1alpha1/instance_pb";
import {
  SetupAppDatabaseResponseSchema,
  SetupProgressEventSchema,
  StepState,
  WatchConfigChangesResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";

import {
  buildConnectionTestRequest,
  buildEmbeddedSetupRequest,
  buildSetupAppDatabaseRequest,
  consumeSetupStreamWithProgress,
  consumeWatchStreamWithProgress,
  createSetupStreamFailureError,
} from "./setup-requests";

const EMBEDDED_TEST_PORT = 5544;

function buildPostgresConfig() {
  return createProto(PostgresConfigSchema, {
    database: "querylane",
    host: "localhost",
    password: "secret",
    port: 5432,
    username: "querylane",
  });
}

function buildSetupResponse(state: StepState, error = "", displayName = "") {
  return createProto(SetupAppDatabaseResponseSchema, {
    event: createProto(SetupProgressEventSchema, {
      displayName,
      error,
      state,
    }),
  });
}

function buildWatchResponse(state: StepState, error = "", displayName = "") {
  return createProto(WatchConfigChangesResponseSchema, {
    event: createProto(SetupProgressEventSchema, {
      displayName,
      error,
      state,
    }),
  });
}

function buildAsyncStream<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;

      return {
        next: () =>
          Promise.resolve(
            index < items.length
              ? { done: false as const, value: items[index++] as T }
              : { done: true as const, value: undefined }
          ),
      };
    },
  };
}

function createControlledAsyncStream<T>() {
  const queue: T[] = [];
  let isClosed = false;
  let wakeReader: (() => void) | null = null;

  const notifyReader = () => {
    const reader = wakeReader;
    wakeReader = null;
    reader?.();
  };

  return {
    close: () => {
      isClosed = true;
      notifyReader();
    },
    push: (item: T) => {
      queue.push(item);
      notifyReader();
    },
    stream: {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          if (queue.length > 0) {
            yield queue.shift() as T;
            continue;
          }

          if (isClosed) {
            return;
          }

          await new Promise<void>((resolve) => {
            wakeReader = resolve;
          });
        }
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

  it("builds setup requests with embedded config payload", () => {
    const request = buildEmbeddedSetupRequest({
      mode: "ephemeral",
      port: EMBEDDED_TEST_PORT,
    });

    expect(request.setup.case).toBe("embeddedConfig");
    if (request.setup.case !== "embeddedConfig") {
      throw new Error("Expected embeddedConfig setup payload");
    }

    expect(request.setup.value.mode).toBe("ephemeral");
    expect(request.setup.value.port).toBe(EMBEDDED_TEST_PORT);
  });
});

describe("setup stream consumption", () => {
  it("extracts failure message from a failed setup event", async () => {
    const responses = [
      buildSetupResponse(
        StepState.FAILED,
        "permission denied",
        "Initialize services"
      ),
    ];
    const stream = buildAsyncStream(responses);

    await expect(
      consumeSetupStreamWithProgress(stream, () => undefined)
    ).resolves.toMatchObject({
      message: "permission denied",
    });
  });

  it("consumes setup stream and returns the last failure message", async () => {
    const responses = [
      buildSetupResponse(StepState.IN_PROGRESS),
      buildSetupResponse(StepState.FAILED, "first"),
      buildSetupResponse(StepState.FAILED, "second"),
    ];
    const stream = buildAsyncStream(responses);

    await expect(
      consumeSetupStreamWithProgress(stream, () => undefined)
    ).resolves.toMatchObject({
      message: "second",
    });
  });

  it("consumes setup stream and forwards progress events", async () => {
    const responses = [
      buildSetupResponse(StepState.PENDING),
      buildSetupResponse(StepState.IN_PROGRESS),
      buildSetupResponse(StepState.SUCCEEDED),
    ];
    const stream = buildAsyncStream(responses);
    const events: StepState[] = [];

    const failure = await consumeSetupStreamWithProgress(stream, (event) => {
      events.push(event.state);
    });

    expect(failure).toBeNull();
    expect(events).toEqual([
      StepState.PENDING,
      StepState.IN_PROGRESS,
      StepState.SUCCEEDED,
    ]);
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

    controlled.push(buildSetupResponse(StepState.PENDING));
    await flushMicrotasks();
    expect(states).toEqual([StepState.PENDING]);

    controlled.push(buildSetupResponse(StepState.IN_PROGRESS));
    await flushMicrotasks();
    expect(states).toEqual([StepState.PENDING, StepState.IN_PROGRESS]);

    controlled.push(buildSetupResponse(StepState.SUCCEEDED));
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
  it("consumes watch stream and forwards progress events", async () => {
    const responses = [
      buildWatchResponse(StepState.PENDING),
      buildWatchResponse(StepState.FAILED, "watch failed"),
    ];
    const stream = buildAsyncStream(responses);
    const events: StepState[] = [];

    const failure = await consumeWatchStreamWithProgress(stream, (event) => {
      events.push(event.state);
    });

    expect(failure).toMatchObject({
      message: "watch failed",
    });
    expect(events).toEqual([StepState.PENDING, StepState.FAILED]);
  });
});

describe("setup stream errors", () => {
  it("propagates stream errors", async () => {
    const failure = new Error("stream failed");
    const stream: AsyncIterable<never> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => Promise.reject(failure),
        };
      },
    };

    await expect(
      consumeSetupStreamWithProgress(stream, () => undefined)
    ).rejects.toThrow("stream failed");
  });

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
