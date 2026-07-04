import { create, type DescService } from "@bufbuild/protobuf";
import {
  type Client,
  Code,
  ConnectError,
  createRouterTransport,
  type ServiceImpl,
  type Transport,
} from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  type SetupAppDatabaseMutationVariables,
  useSetupAppDatabaseMutation,
  useWatchConfigChanges,
  type WatchErrorReason,
} from "@/hooks/api/onboarding";
import {
  EmbeddedSetupConfigSchema,
  OnboardingService,
  type SetupAppDatabaseRequest,
  SetupAppDatabaseRequestSchema,
  SetupAppDatabaseResponseSchema,
  type SetupProgressEvent,
  SetupProgressEventSchema,
  SetupStep,
  StepState,
  WatchConfigChangesResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";

// Production builds run useOnboardingStreamingClient through the React
// Compiler, which memoizes the createClient(OnboardingService, transport)
// call per transport. Vitest compiles with esbuild only, so without this
// memoization every render would produce a new client identity and
// useWatchConfigChanges would abort and restart its stream on each render.
// Memoizing createClient per (transport, service) restores the compiled
// behavior the hook relies on.
vi.mock("@connectrpc/connect", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@connectrpc/connect")>();
  const clientsByTransport = new WeakMap<
    Transport,
    Map<DescService, unknown>
  >();

  function createClient<T extends DescService>(
    service: T,
    transport: Transport
  ): Client<T> {
    let clientsByService = clientsByTransport.get(transport);
    if (!clientsByService) {
      clientsByService = new Map();
      clientsByTransport.set(transport, clientsByService);
    }
    let client = clientsByService.get(service);
    if (client === undefined) {
      client = actual.createClient(service, transport);
      clientsByService.set(service, client);
    }
    return client as Client<T>;
  }

  return { ...actual, createClient };
});

const WATCH_BACKOFF_SCHEDULE_MS = [500, 1000, 2000] as const;

type OnboardingImplementation = Partial<ServiceImpl<typeof OnboardingService>>;

function createOnboardingTransport(implementation: OnboardingImplementation) {
  return createRouterTransport(({ service }) => {
    service(OnboardingService, implementation);
  });
}

const activeQueryClients: QueryClient[] = [];

// An infinite gcTime stops TanStack Query from scheduling cache
// garbage-collection timers that would outlive the test; afterEach clears
// the cache instead.
const TEST_GC_TIME = Number.POSITIVE_INFINITY;

function createWrapper(transport: Transport) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: TEST_GC_TIME, retry: false },
      queries: { gcTime: TEST_GC_TIME, retry: false },
    },
  });
  activeQueryClients.push(queryClient);

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <TransportProvider transport={transport}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </TransportProvider>
    );
  };
}

function connectingEvent() {
  return create(SetupProgressEventSchema, {
    displayName: "Connecting to metadata database",
    state: StepState.IN_PROGRESS,
    stepId: SetupStep.CONNECTING,
  });
}

function succeededEvent() {
  return create(SetupProgressEventSchema, {
    displayName: "Running migrations",
    state: StepState.SUCCEEDED,
    stepId: SetupStep.MIGRATING,
  });
}

function failedEvent() {
  return create(SetupProgressEventSchema, {
    displayName: "Running migrations",
    error: "migration failed",
    state: StepState.FAILED,
    stepId: SetupStep.MIGRATING,
  });
}

function setupResponse(event: SetupProgressEvent) {
  return create(SetupAppDatabaseResponseSchema, { event });
}

function watchResponse(event: SetupProgressEvent) {
  return create(WatchConfigChangesResponseSchema, { event });
}

// The router transport expects server-streaming handlers to return an
// AsyncIterable. Building the iterable here keeps the individual handlers
// synchronous functions.
function streamOf<T>(...items: T[]): AsyncIterable<T> {
  return (async function* stream() {
    for (const item of items) {
      yield await Promise.resolve(item);
    }
  })();
}

function buildEmbeddedSetupRequest() {
  return create(SetupAppDatabaseRequestSchema, {
    setup: {
      case: "embeddedConfig",
      value: create(EmbeddedSetupConfigSchema, {
        mode: "persistent",
        port: 5433,
      }),
    },
  });
}

// Drains pending microtask chains (the router transport is promise-based and
// never schedules macrotasks) without advancing fake timers, so backoff
// timers only fire when a test advances them explicitly.
async function flushMicrotasks(ticks = 20) {
  for (let tick = 0; tick < ticks; tick += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function flushUntil(condition: () => boolean, maxTicks = 200) {
  for (let tick = 0; tick < maxTicks; tick += 1) {
    if (condition()) {
      return;
    }
    await act(async () => {
      await Promise.resolve();
    });
  }
  throw new Error("condition was not met within the microtask budget");
}

async function advanceTimers(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

afterEach(() => {
  cleanup();
  // Drop cached mutations so pending garbage-collection timers do not
  // outlive the test.
  for (const queryClient of activeQueryClients.splice(0)) {
    queryClient.clear();
  }
  vi.useRealTimers();
});

describe("useSetupAppDatabaseMutation", () => {
  test("resolves and reports each progress event from the setup stream", async () => {
    const requests: SetupAppDatabaseRequest[] = [];
    const transport = createOnboardingTransport({
      setupAppDatabase(request) {
        requests.push(request);
        return streamOf(
          setupResponse(connectingEvent()),
          setupResponse(succeededEvent())
        );
      },
    });
    const onProgress = vi.fn<(event: SetupProgressEvent) => void>();
    const { result } = renderHook(
      () => useSetupAppDatabaseMutation({ onProgress }),
      { wrapper: createWrapper(transport) }
    );

    await act(async () => {
      await result.current.mutateAsync({
        request: buildEmbeddedSetupRequest(),
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.setup.case).toBe("embeddedConfig");
    expect(onProgress.mock.calls.map(([event]) => event.state)).toEqual([
      StepState.IN_PROGRESS,
      StepState.SUCCEEDED,
    ]);
  });

  test("resolves without options when the stream completes", async () => {
    const transport = createOnboardingTransport({
      setupAppDatabase: () => streamOf(setupResponse(succeededEvent())),
    });
    const { result } = renderHook(() => useSetupAppDatabaseMutation(), {
      wrapper: createWrapper(transport),
    });

    await act(async () => {
      await result.current.mutateAsync({
        request: buildEmbeddedSetupRequest(),
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  test("rejects with the failed step error when the stream reports a failure", async () => {
    const transport = createOnboardingTransport({
      setupAppDatabase: () =>
        streamOf(
          setupResponse(connectingEvent()),
          setupResponse(failedEvent())
        ),
    });
    const onError = vi.fn<(error: Error) => void>();
    const onProgress = vi.fn<(event: SetupProgressEvent) => void>();
    const { result } = renderHook(
      () => useSetupAppDatabaseMutation({ onError, onProgress }),
      { wrapper: createWrapper(transport) }
    );

    act(() => {
      result.current.mutate({ request: buildEmbeddedSetupRequest() });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error?.message).toBe("migration failed");
    const error = result.current.error;
    expect(error !== null && "failedEvent" in error).toBe(true);
    expect(onError).toHaveBeenCalledTimes(1);
    // The failed event is still surfaced to onProgress before rejection.
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  test("rejects when the provided abort signal is already aborted", async () => {
    const transport = createOnboardingTransport({
      setupAppDatabase: () => streamOf(setupResponse(succeededEvent())),
    });
    const onError = vi.fn<(error: Error) => void>();
    const { result } = renderHook(
      () => useSetupAppDatabaseMutation({ onError }),
      { wrapper: createWrapper(transport) }
    );
    const abortController = new AbortController();
    abortController.abort();

    const variables: SetupAppDatabaseMutationVariables = {
      request: buildEmbeddedSetupRequest(),
      signal: abortController.signal,
    };
    await act(async () => {
      await expect(result.current.mutateAsync(variables)).rejects.toThrow();
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(ConnectError.from(result.current.error).code).toBe(Code.Canceled);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("useWatchConfigChanges", () => {
  test("reports progress and completion for a successful watch stream", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const transport = createOnboardingTransport({
      watchConfigChanges() {
        attempts += 1;
        return streamOf(
          watchResponse(connectingEvent()),
          watchResponse(succeededEvent())
        );
      },
    });
    const onComplete = vi.fn<() => void>();
    const onError = vi.fn<(error: Error, reason: WatchErrorReason) => void>();
    const onProgress = vi.fn<(event: SetupProgressEvent) => void>();
    const { result } = renderHook(
      () =>
        useWatchConfigChanges({
          enabled: true,
          onComplete,
          onError,
          onProgress,
        }),
      { wrapper: createWrapper(transport) }
    );

    expect(result.current.isRunning).toBe(true);

    await flushUntil(() => result.current.isRunning === false);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(onProgress.mock.calls.map(([event]) => event.stepId)).toEqual([
      SetupStep.CONNECTING,
      SetupStep.MIGRATING,
    ]);
    expect(result.current.manualRetryRequired).toBe(false);
    expect(attempts).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("reports failed_step without retrying when the stream delivers a failed event", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const transport = createOnboardingTransport({
      watchConfigChanges() {
        attempts += 1;
        return streamOf(
          watchResponse(connectingEvent()),
          watchResponse(failedEvent())
        );
      },
    });
    const onComplete = vi.fn<() => void>();
    const onError = vi.fn<(error: Error, reason: WatchErrorReason) => void>();
    const { result } = renderHook(
      () => useWatchConfigChanges({ enabled: true, onComplete, onError }),
      { wrapper: createWrapper(transport) }
    );

    await flushUntil(() => result.current.isRunning === false);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0].message).toBe("migration failed");
    expect(onError.mock.calls[0]?.[1]).toBe("failed_step");
    expect(onComplete).not.toHaveBeenCalled();
    expect(result.current.manualRetryRequired).toBe(false);
    expect(attempts).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("retries with 500/1000/2000ms backoff before requiring manual retry", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const transport = createOnboardingTransport({
      watchConfigChanges() {
        attempts += 1;
        if (attempts <= 4) {
          throw new ConnectError("watch unavailable", Code.Unavailable);
        }
        return streamOf(watchResponse(succeededEvent()));
      },
    });
    const onComplete = vi.fn<() => void>();
    const onError = vi.fn<(error: Error, reason: WatchErrorReason) => void>();
    const { result } = renderHook(
      () => useWatchConfigChanges({ enabled: true, onComplete, onError }),
      { wrapper: createWrapper(transport) }
    );

    await flushUntil(() => attempts === 1);

    for (const [index, backoffMs] of WATCH_BACKOFF_SCHEDULE_MS.entries()) {
      // The next attempt only starts once the full backoff has elapsed.
      await advanceTimers(backoffMs - 1);
      await flushMicrotasks();
      expect(attempts).toBe(index + 1);

      await advanceTimers(1);
      await flushUntil(() => attempts === index + 2);
    }

    await flushUntil(() => result.current.manualRetryRequired);

    expect(attempts).toBe(4);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(ConnectError.from(onError.mock.calls[0]?.[0]).rawMessage).toBe(
      "watch unavailable"
    );
    expect(onError.mock.calls[0]?.[1]).toBe("stream_error");
    expect(onComplete).not.toHaveBeenCalled();
    expect(result.current.isRunning).toBe(false);
    expect(result.current.retryPending).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("retry() restarts the stream and resolves once the watch settles", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const transport = createOnboardingTransport({
      watchConfigChanges() {
        attempts += 1;
        if (attempts <= 4) {
          throw new ConnectError("watch unavailable", Code.Unavailable);
        }
        return streamOf(watchResponse(succeededEvent()));
      },
    });
    const onComplete = vi.fn<() => void>();
    const onError = vi.fn<(error: Error, reason: WatchErrorReason) => void>();
    const { result } = renderHook(
      () => useWatchConfigChanges({ enabled: true, onComplete, onError }),
      { wrapper: createWrapper(transport) }
    );

    await flushUntil(() => attempts === 1);
    for (const backoffMs of WATCH_BACKOFF_SCHEDULE_MS) {
      await advanceTimers(backoffMs);
    }
    await flushUntil(() => result.current.manualRetryRequired);

    let retryPromise: Promise<void> | undefined;
    let secondRetryPromise: Promise<void> | undefined;
    act(() => {
      retryPromise = result.current.retry();
      secondRetryPromise = result.current.retry();
    });

    // A retry already in flight is reused instead of restarting the stream.
    expect(secondRetryPromise).toBe(retryPromise);
    expect(result.current.manualRetryRequired).toBe(false);
    expect(result.current.retryPending).toBe(true);

    await act(async () => {
      await retryPromise;
    });
    await flushUntil(() => result.current.isRunning === false);

    expect(attempts).toBe(5);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(result.current.retryPending).toBe(false);
    expect(result.current.manualRetryRequired).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("aborts the in-flight stream when disabled", async () => {
    vi.useFakeTimers();
    let abortedByClient = false;
    const transport = createOnboardingTransport({
      async *watchConfigChanges(_request, context) {
        yield watchResponse(connectingEvent());
        await new Promise<void>((resolve) => {
          context.signal.addEventListener(
            "abort",
            () => {
              abortedByClient = true;
              resolve();
            },
            { once: true }
          );
        });
      },
    });
    const onComplete = vi.fn<() => void>();
    const onError = vi.fn<(error: Error, reason: WatchErrorReason) => void>();
    const onProgress = vi.fn<(event: SetupProgressEvent) => void>();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useWatchConfigChanges({ enabled, onComplete, onError, onProgress }),
      { initialProps: { enabled: true }, wrapper: createWrapper(transport) }
    );

    await flushUntil(() => onProgress.mock.calls.length === 1);
    expect(result.current.isRunning).toBe(true);

    rerender({ enabled: false });

    expect(result.current.isRunning).toBe(false);
    await flushUntil(() => abortedByClient);
    await flushMicrotasks();

    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.manualRetryRequired).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("stops retrying when disabled during the backoff wait", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const transport = createOnboardingTransport({
      watchConfigChanges() {
        attempts += 1;
        if (attempts > 0) {
          throw new ConnectError("watch unavailable", Code.Unavailable);
        }
        return streamOf(watchResponse(succeededEvent()));
      },
    });
    const onError = vi.fn<(error: Error, reason: WatchErrorReason) => void>();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useWatchConfigChanges({ enabled, onError }),
      { initialProps: { enabled: true }, wrapper: createWrapper(transport) }
    );

    await flushUntil(() => attempts === 1);

    rerender({ enabled: false });

    // Flushing the pending backoff timer must not start another attempt.
    await advanceTimers(500);
    await flushMicrotasks();

    expect(attempts).toBe(1);
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.isRunning).toBe(false);
    expect(result.current.manualRetryRequired).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("does not start the watch stream while disabled", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const transport = createOnboardingTransport({
      watchConfigChanges() {
        attempts += 1;
        return streamOf(watchResponse(succeededEvent()));
      },
    });
    const { result } = renderHook(
      () => useWatchConfigChanges({ enabled: false }),
      { wrapper: createWrapper(transport) }
    );

    await flushMicrotasks();

    expect(attempts).toBe(0);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.retryPending).toBe(false);
    expect(result.current.manualRetryRequired).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("normalizes non-Error stream failures before reporting them", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const transport = createOnboardingTransport({
      watchConfigChanges() {
        attempts += 1;
        return streamOf(
          watchResponse(connectingEvent()),
          watchResponse(succeededEvent())
        );
      },
    });
    const nonErrorFailure: unknown = "watch consumer failed without an Error";
    const onError = vi.fn<(error: Error, reason: WatchErrorReason) => void>();
    // Throwing from onProgress is treated like a stream failure; a non-Error
    // value must be normalized into an Error before reaching onError.
    const onProgress = vi.fn<(event: SetupProgressEvent) => void>(() => {
      throw nonErrorFailure;
    });
    const { result } = renderHook(
      () => useWatchConfigChanges({ enabled: true, onError, onProgress }),
      { wrapper: createWrapper(transport) }
    );

    await flushUntil(() => attempts === 1);
    for (const backoffMs of WATCH_BACKOFF_SCHEDULE_MS) {
      await advanceTimers(backoffMs);
    }
    await flushUntil(() => result.current.manualRetryRequired);

    expect(attempts).toBe(4);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0]?.[0].message).toBe(
      "Onboarding request failed"
    );
    expect(onError.mock.calls[0]?.[1]).toBe("stream_error");
    expect(vi.getTimerCount()).toBe(0);
  });

  test("reports again through the defensive catch when the consumer onError throws", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const transport = createOnboardingTransport({
      watchConfigChanges() {
        attempts += 1;
        if (attempts > 0) {
          throw new ConnectError("watch unavailable", Code.Unavailable);
        }
        return streamOf(watchResponse(succeededEvent()));
      },
    });
    const onError = vi
      .fn<(error: Error, reason: WatchErrorReason) => void>()
      .mockImplementationOnce(() => {
        throw new Error("consumer onError exploded");
      });
    const { result } = renderHook(
      () => useWatchConfigChanges({ enabled: true, onError }),
      { wrapper: createWrapper(transport) }
    );

    await flushUntil(() => attempts === 1);
    for (const backoffMs of WATCH_BACKOFF_SCHEDULE_MS) {
      await advanceTimers(backoffMs);
    }
    await flushUntil(() => onError.mock.calls.length === 2);

    // Current behavior: a throwing onError consumer is reported a second
    // time through the defensive catch, now carrying the consumer failure
    // instead of the original stream failure.
    expect(onError.mock.calls[0]?.[1]).toBe("stream_error");
    expect(onError.mock.calls[1]?.[0].message).toBe(
      "consumer onError exploded"
    );
    expect(onError.mock.calls[1]?.[1]).toBe("stream_error");
    expect(result.current.manualRetryRequired).toBe(true);
    await flushUntil(() => result.current.isRunning === false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
