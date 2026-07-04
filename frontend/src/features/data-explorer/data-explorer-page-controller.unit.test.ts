import type { Transport } from "@connectrpc/connect";
import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { prefetchTableDetails } from "@/features/data-explorer/data-explorer-page-controller";
import {
  INTENT_PREFETCH_POLICY,
  RESOURCE_QUERY_OPTIONS,
} from "@/lib/query-policy";

const transport = {} as Transport;

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

function makeQueryClientStub(calls: unknown[]): QueryClient {
  return {
    getQueryState: () => undefined,
    prefetchQuery: (options: unknown) => {
      calls.push(options);
      return Promise.resolve();
    },
  } as unknown as QueryClient;
}

const activeSchema = { id: "public", name: "public", owner: "postgres" };

describe("prefetchTableDetails", () => {
  test("schedules intent prefetches for all table detail queries", async () => {
    const calls: unknown[] = [];
    const queryClient = makeQueryClientStub(calls);

    prefetchTableDetails({
      activeSchema,
      databaseId: "mydb",
      instanceId: "local",
      name: "users",
      queryClient,
      rawTables: [],
      transport,
    });

    await runIntentPrefetchTimers();

    // columns, indexes, constraints, policies, triggers, partition metadata
    expect(calls).toHaveLength(6);
    for (const call of calls) {
      expect(call).toMatchObject({
        meta: { appErrorSurface: "silent" },
        staleTime: RESOURCE_QUERY_OPTIONS.tableMetadata.staleTime,
      });
    }
  });

  test("resolves tableId from rawTables displayName before prefetching", async () => {
    const calls: unknown[] = [];
    const queryClient = makeQueryClientStub(calls);

    prefetchTableDetails({
      activeSchema,
      databaseId: "mydb",
      instanceId: "local",
      name: "Users Table",
      queryClient,
      rawTables: [
        {
          displayName: "Users Table",
          name: "instances/local/databases/mydb/schemas/public/tables/users",
        },
      ],
      transport,
    });

    await runIntentPrefetchTimers();

    expect(calls).toHaveLength(6);
    // Verify query keys include the resolved tableId "users", not the display name
    for (const call of calls as Array<{ queryKey: unknown[] }>) {
      const keyStr = JSON.stringify(call.queryKey);
      expect(keyStr).toContain("users");
    }
  });

  test("skips already-fresh table detail queries on intent", async () => {
    const freshTimestamp = Date.now() - 1000; // 1s ago, staleTime is 5 min
    const calls: unknown[] = [];
    const queryClient = {
      getQueryState: () => ({
        dataUpdatedAt: freshTimestamp,
        status: "success" as const,
      }),
      prefetchQuery: vi.fn((options: unknown) => {
        calls.push(options);
        return Promise.resolve();
      }),
    } as unknown as QueryClient;

    prefetchTableDetails({
      activeSchema,
      databaseId: "mydb",
      instanceId: "local",
      name: "users",
      queryClient,
      rawTables: [],
      transport,
    });

    await runIntentPrefetchTimers();

    // All table detail queries are fresh — none should reach prefetchQuery
    expect(calls).toHaveLength(0);
  });

  test("dedupes repeated intent calls for the same table", async () => {
    const calls: unknown[] = [];
    const queryClient = makeQueryClientStub(calls);

    prefetchTableDetails({
      activeSchema,
      databaseId: "mydb",
      instanceId: "local",
      name: "users",
      queryClient,
      rawTables: [],
      transport,
    });
    prefetchTableDetails({
      activeSchema,
      databaseId: "mydb",
      instanceId: "local",
      name: "users",
      queryClient,
      rawTables: [],
      transport,
    });

    await runIntentPrefetchTimers();

    // Each query key is deduped.
    expect(calls).toHaveLength(6);
  });
});
