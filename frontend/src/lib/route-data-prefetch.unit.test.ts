import type { Transport } from "@connectrpc/connect";
import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";
import { RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import {
  databaseRouteDataQueries,
  explorerRouteDataQueries,
  extensionRouteDataQueries,
  instanceRouteDataQueries,
  prefetchRouteData,
} from "@/lib/route-data-prefetch";

const transport = {} as Transport;

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
    const calls: unknown[] = [];
    const freshTimestamp = Date.now() - 1000; // 1 s ago — well within 5-min staleTime
    const queryClient = {
      getQueryState: () => ({
        dataUpdatedAt: freshTimestamp,
        status: "success" as const,
      }),
      prefetchQuery: (options: unknown) => {
        calls.push(options);
        return Promise.resolve();
      },
    } as unknown as QueryClient;

    prefetchRouteData(
      { queryClient, transport },
      explorerRouteDataQueries({
        databaseId: "postgres",
        instanceId: "local",
        search: { category: "tables", name: "users", schema: "public" },
        transport,
      })
    );

    // Metadata uses a 5-minute stale policy and is skipped; table rows use
    // staleTime=0, so direct route entry still fetches fresh visible rows.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      staleTime: RESOURCE_QUERY_OPTIONS.tableRows.staleTime,
    });
  });

  test("returns immediately when route prefetch promises are still pending", async () => {
    const calls: unknown[] = [];
    let resolvePrefetch: () => void = () => undefined;
    const pendingPrefetch = new Promise<void>((resolve) => {
      resolvePrefetch = resolve;
    });
    const queryClient = {
      getQueryState: () => undefined,
      prefetchQuery: (options: unknown) => {
        calls.push(options);
        return pendingPrefetch;
      },
    } as unknown as QueryClient;

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
    const queryClient = {
      getQueryState: () => undefined,
      prefetchQuery: (options: unknown) => {
        calls.push(options);
        return Promise.resolve();
      },
    } as unknown as QueryClient;

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
