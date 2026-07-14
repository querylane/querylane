import type { Transport } from "@connectrpc/connect";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { prefetchTableDetails } from "@/features/data-explorer/data-explorer-page-controller";
import { tableDetailQueryOptions } from "@/hooks/api/table";
import {
  INTENT_PREFETCH_POLICY,
  RESOURCE_QUERY_OPTIONS,
} from "@/lib/query-policy";

const TEST_NUMBER_6 = 6;

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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } },
  });
  vi.spyOn(queryClient, "prefetchQuery").mockImplementation((options) => {
    calls.push(options);
    return Promise.resolve();
  });
  return queryClient;
}

function makeFreshQueryClientStub(calls: unknown[]): {
  queryClient: QueryClient;
  seededQueryCount: number;
} {
  const queryClient = makeQueryClientStub(calls);
  const seededQueries = tableDetailQueryOptions({
    databaseId: "mydb",
    instanceId: "local",
    schemaId: activeSchema.id,
    tableId: "users",
    transport,
  });
  for (const query of seededQueries) {
    queryClient.setQueryData(query.queryKey, {});
  }
  return { queryClient, seededQueryCount: seededQueries.length };
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
    expect(calls).toHaveLength(TEST_NUMBER_6);
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

    expect(calls).toHaveLength(TEST_NUMBER_6);
    // Verify query keys include the resolved tableId "users", not the display name
    for (const call of calls as Array<{ queryKey: unknown[] }>) {
      const keyStr = JSON.stringify(call.queryKey);
      expect(keyStr).toContain("users");
    }
  });

  test("skips already-fresh table detail queries on intent", async () => {
    const calls: unknown[] = [];
    const { queryClient, seededQueryCount } = makeFreshQueryClientStub(calls);

    expect(seededQueryCount).toBeGreaterThan(0);

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
    expect(calls).toHaveLength(TEST_NUMBER_6);
  });
});
