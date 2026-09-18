import { describe, expect, rs, test } from "@rstest/core";
import { QueryClient } from "@tanstack/react-query";
import { RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import {
  databaseRouteDataQueries,
  explorerRouteDataQueries,
  extensionRouteDataQueries,
  instanceRouteDataQueries,
  prefetchRouteData,
} from "@/lib/route-data-prefetch";
import { createTestRouterTransport } from "@/test/router-transport";

const transport = createTestRouterTransport(() => undefined);

function makeQueryClientStub(
  calls: unknown[],
  prefetchResult: Promise<void> = Promise.resolve()
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  rs.spyOn(queryClient, "query").mockImplementation((options) => {
    calls.push(options);
    return prefetchResult;
  });
  return queryClient;
}

function markFreshRouteDataQueries(
  queryClient: QueryClient,
  queries: ReturnType<typeof explorerRouteDataQueries>
) {
  for (const query of queries) {
    if (typeof query.staleTime === "number" && query.staleTime > 0) {
      queryClient.setQueryData(query.queryKey, {});
    }
  }
}

describe("route data prefetch registry", () => {
  test("describes instance route data in one place", () => {
    const queries = instanceRouteDataQueries({
      instanceId: "local",
      transport,
    });

    expect(queries).toHaveLength(3);
    expect(queries.map((query) => query.staleTime)).toEqual([
      RESOURCE_QUERY_OPTIONS.instanceList.staleTime,
      RESOURCE_QUERY_OPTIONS.instanceDetail.staleTime,
      RESOURCE_QUERY_OPTIONS.databaseList.staleTime,
    ]);
  });

  test("describes database overview route data", () => {
    const queries = databaseRouteDataQueries({
      databaseId: "postgres",
      instanceId: "local",
      transport,
    });

    expect(queries).toHaveLength(1);
    expect(queries[0]?.staleTime).toBe(
      RESOURCE_QUERY_OPTIONS.selectedDatabase.staleTime
    );
  });

  test("describes database extensions route data", () => {
    const queries = extensionRouteDataQueries({
      databaseId: "postgres",
      instanceId: "local",
      transport,
    });

    expect(queries).toHaveLength(2);
    expect(queries.map((query) => query.staleTime)).toEqual([
      RESOURCE_QUERY_OPTIONS.selectedDatabase.staleTime,
      RESOURCE_QUERY_OPTIONS.extensionList.staleTime,
    ]);
  });

  test("keeps explorer prefetch cheap without selected schema", () => {
    const queries = explorerRouteDataQueries({
      databaseId: "postgres",
      instanceId: "local",
      search: {},
      transport,
    });

    expect(queries).toHaveLength(1);
    expect(queries.map((query) => query.staleTime)).toEqual([
      RESOURCE_QUERY_OPTIONS.selectedDatabase.staleTime,
    ]);
  });

  test("does not prefetch catalog pages when only schema is known", () => {
    const queries = explorerRouteDataQueries({
      databaseId: "postgres",
      instanceId: "local",
      search: { schema: "public" },
      transport,
    });

    expect(queries).toHaveLength(1);
    expect(queries.at(-1)?.staleTime).toBe(
      RESOURCE_QUERY_OPTIONS.selectedDatabase.staleTime
    );
  });

  test("prefetches only first-paint table data for a selected table", () => {
    const queries = explorerRouteDataQueries({
      databaseId: "postgres",
      instanceId: "local",
      search: { category: "tables", name: "users", schema: "public" },
      transport,
    });

    // selectedDatabase + visible columns header/query validation + first rows page.
    expect(queries).toHaveLength(3);
    expect(queries.map((query) => query.staleTime)).toEqual([
      RESOURCE_QUERY_OPTIONS.selectedDatabase.staleTime,
      RESOURCE_QUERY_OPTIONS.tableMetadata.staleTime,
      RESOURCE_QUERY_OPTIONS.tableRows.staleTime,
    ]);
  });

  test("skips fresh metadata but still refetches table rows", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      },
    });
    const unary = rs.spyOn(transport, "unary");
    const queries = explorerRouteDataQueries({
      databaseId: "postgres",
      instanceId: "local",
      search: { category: "tables", name: "users", schema: "public" },
      transport,
    });
    markFreshRouteDataQueries(queryClient, queries);
    try {
      prefetchRouteData({ queryClient, transport }, queries);
      expect(unary.mock.calls.map(([method]) => method.name)).toEqual([
        "ReadRows",
      ]);
    } finally {
      queryClient.clear();
      unary.mockRestore();
    }
  });

  test("refetches invalidated metadata even inside its stale time", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      },
    });
    const unary = rs.spyOn(transport, "unary");
    const queries = databaseRouteDataQueries({
      databaseId: "postgres",
      instanceId: "local",
      transport,
    });
    markFreshRouteDataQueries(queryClient, queries);
    await queryClient.invalidateQueries();
    try {
      prefetchRouteData({ queryClient, transport }, queries);
      expect(unary.mock.calls.map(([method]) => method.name)).toEqual([
        "GetDatabase",
      ]);
    } finally {
      queryClient.clear();
      unary.mockRestore();
    }
  });

  test("returns immediately when route prefetch promises are still pending", async () => {
    const calls: unknown[] = [];
    let resolvePrefetch: () => void = () => undefined;
    const pendingPrefetch = new Promise<void>((resolve) => {
      resolvePrefetch = resolve;
    });
    const queryClient = makeQueryClientStub(calls, pendingPrefetch);

    prefetchRouteData(
      { queryClient, transport },
      databaseRouteDataQueries({
        databaseId: "postgres",
        instanceId: "local",
        transport,
      })
    );

    expect(calls).toHaveLength(1);
    resolvePrefetch();
    await pendingPrefetch;
    await Promise.resolve();
  });

  test("prefetches every registered route data query", () => {
    const calls: unknown[] = [];
    const queryClient = makeQueryClientStub(calls);

    prefetchRouteData(
      { queryClient, transport },
      databaseRouteDataQueries({
        databaseId: "postgres",
        instanceId: "local",
        transport,
      })
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      meta: { appErrorSurface: "silent" },
      staleTime: RESOURCE_QUERY_OPTIONS.selectedDatabase.staleTime,
    });
  });
});
