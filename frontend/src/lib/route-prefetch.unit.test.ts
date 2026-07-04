import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { INTENT_PREFETCH_POLICY } from "@/lib/query-policy";
import {
  prefetchRouteQuery,
  prefetchRouteQueryOnIntent,
} from "@/lib/route-prefetch";

async function runIntentPrefetchTimers() {
  await vi.advanceTimersByTimeAsync(INTENT_PREFETCH_POLICY.delayMs);
}

beforeEach(function useIntentPrefetchFakeTimers() {
  vi.useFakeTimers();
});

afterEach(function expectNoIntentPrefetchTimersLeaked() {
  const timerCount = vi.getTimerCount();
  vi.useRealTimers();
  if (timerCount !== 0) {
    throw new Error(`Expected no leaked prefetch timers, found ${timerCount}.`);
  }
});

type QueryClientStub = Pick<QueryClient, "getQueryState" | "prefetchQuery">;

function createFreshQueryState() {
  return {
    data: undefined,
    dataUpdateCount: 1,
    dataUpdatedAt: Date.now(),
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    fetchFailureCount: 0,
    fetchFailureReason: null,
    fetchMeta: null,
    fetchStatus: "idle" as const,
    isInvalidated: false,
    status: "success" as const,
  };
}

function createQueryClientStub({
  getQueryState = () => undefined,
  prefetchQuery = () => Promise.resolve(),
}: Partial<QueryClientStub>): QueryClientStub {
  return {
    getQueryState,
    prefetchQuery,
  };
}

describe("route prefetch", () => {
  test("marks speculative prefetch errors as silent", () => {
    const calls: unknown[] = [];
    const queryClient = createQueryClientStub({
      prefetchQuery: (options) => {
        calls.push(options);
        return Promise.resolve();
      },
    });

    prefetchRouteQuery(queryClient, {
      meta: { source: "route" },
      queryKey: ["instances"],
      staleTime: 30_000,
    });

    expect(calls).toEqual([
      {
        meta: { appErrorSurface: "silent", source: "route" },
        queryKey: ["instances"],
        staleTime: 30_000,
      },
    ]);
  });

  test("does not prefetch data that is still fresh", () => {
    const calls: unknown[] = [];
    const queryClient = createQueryClientStub({
      getQueryState: createFreshQueryState,
      prefetchQuery: (options) => {
        calls.push(options);
        return Promise.resolve();
      },
    });

    prefetchRouteQuery(queryClient, {
      queryKey: ["instances"],
      staleTime: 30_000,
    });

    expect(calls).toEqual([]);
  });

  test("dedupes repeated intent prefetches for the same query key", async () => {
    const calls: unknown[] = [];
    const queryClient = createQueryClientStub({
      prefetchQuery: (options) => {
        calls.push(options);
        return Promise.resolve();
      },
    });

    prefetchRouteQueryOnIntent(queryClient, {
      queryKey: ["database", "postgres"],
      staleTime: 30_000,
    });
    prefetchRouteQueryOnIntent(queryClient, {
      queryKey: ["database", "postgres"],
      staleTime: 30_000,
    });

    await runIntentPrefetchTimers();

    expect(calls).toHaveLength(1);
  });

  test("allows different intent query keys to prefetch independently", async () => {
    const calls: unknown[] = [];
    const queryClient = createQueryClientStub({
      prefetchQuery: (options) => {
        calls.push(options);
        return Promise.resolve();
      },
    });

    prefetchRouteQueryOnIntent(queryClient, {
      queryKey: ["database", "postgres"],
      staleTime: 30_000,
    });
    prefetchRouteQueryOnIntent(queryClient, {
      queryKey: ["database", "template1"],
      staleTime: 30_000,
    });

    await runIntentPrefetchTimers();

    expect(calls).toHaveLength(2);
  });
  test("prefetches immediately when freshness cannot be determined", () => {
    const calls: unknown[] = [];
    const queryClient = createQueryClientStub({
      prefetchQuery: (options) => {
        calls.push(options);
        return Promise.resolve();
      },
    });

    prefetchRouteQuery(queryClient, { queryKey: ["instances"] });

    expect(calls).toHaveLength(1);
  });

  test("schedules intent prefetches when query key cannot be serialized", async () => {
    const calls: unknown[] = [];
    const queryClient = createQueryClientStub({
      prefetchQuery: (options) => {
        calls.push(options);
        return Promise.resolve();
      },
    });
    const circular: unknown[] = [];
    circular.push(circular);

    prefetchRouteQueryOnIntent(queryClient, {
      queryKey: circular,
      staleTime: 30_000,
    });

    await runIntentPrefetchTimers();

    expect(calls).toHaveLength(1);
  });
  test("swallows speculative prefetch failures", async () => {
    const queryClient = createQueryClientStub({
      prefetchQuery: () => Promise.reject(new Error("backend unavailable")),
    });

    prefetchRouteQuery(queryClient, { queryKey: ["instances"] });

    await Promise.resolve();
  });
});
