import type {
  FetchQueryOptions,
  QueryClient,
  QueryKey,
} from "@tanstack/react-query";
import { INTENT_PREFETCH_POLICY } from "@/lib/query-policy";

type RoutePrefetchClient = Pick<QueryClient, "getQueryState" | "prefetchQuery">;

type RoutePrefetchOptions<
  QueryFnData,
  QueryError,
  QueryData,
  PrefetchQueryKey extends QueryKey,
> = FetchQueryOptions<QueryFnData, QueryError, QueryData, PrefetchQueryKey> & {
  meta?: Record<string, unknown> | undefined;
};

const scheduledIntentPrefetches = new Set<string>();

function stablePrefetchKey(queryKey: QueryKey): string | null {
  try {
    return JSON.stringify(queryKey);
  } catch {
    return null;
  }
}

function isQueryFresh({
  queryClient,
  queryKey,
  staleTime,
}: {
  queryClient: RoutePrefetchClient;
  queryKey: QueryKey;
  staleTime: unknown;
}) {
  if (typeof staleTime !== "number" || staleTime <= 0) {
    return false;
  }

  const queryState = queryClient.getQueryState(queryKey);
  if (!(queryState?.dataUpdatedAt && queryState.status === "success")) {
    return false;
  }

  return Date.now() - queryState.dataUpdatedAt < staleTime;
}

function prefetchSilently<
  QueryFnData,
  QueryError,
  QueryData,
  PrefetchQueryKey extends QueryKey,
>(
  queryClient: RoutePrefetchClient,
  options: RoutePrefetchOptions<
    QueryFnData,
    QueryError,
    QueryData,
    PrefetchQueryKey
  >
) {
  if (
    isQueryFresh({
      queryClient,
      queryKey: options.queryKey,
      staleTime: options.staleTime,
    })
  ) {
    return;
  }

  queryClient
    .prefetchQuery({
      ...options,
      meta: {
        ...(options.meta ?? {}),
        appErrorSurface: "silent",
      },
    })
    .catch(() => undefined);
}

/**
 * Warm route data without turning speculative fetch failures into app errors.
 * Use for TanStack Router preload/intent paths, not for route-critical awaits.
 */
function prefetchRouteQuery<
  QueryFnData,
  QueryError,
  QueryData,
  PrefetchQueryKey extends QueryKey,
>(
  queryClient: RoutePrefetchClient,
  options: RoutePrefetchOptions<
    QueryFnData,
    QueryError,
    QueryData,
    PrefetchQueryKey
  >
) {
  prefetchSilently(queryClient, options);
}

/**
 * Warm hover/focus intent data after a small delay. This protects the backend
 * from accidental mouse sweeps while keeping deliberate navigation snappy.
 */
function prefetchRouteQueryOnIntent<
  QueryFnData,
  QueryError,
  QueryData,
  PrefetchQueryKey extends QueryKey,
>(
  queryClient: RoutePrefetchClient,
  options: RoutePrefetchOptions<
    QueryFnData,
    QueryError,
    QueryData,
    PrefetchQueryKey
  >
) {
  const key = stablePrefetchKey(options.queryKey);
  if (!key) {
    globalThis.setTimeout(
      () => prefetchSilently(queryClient, options),
      INTENT_PREFETCH_POLICY.delayMs
    );
    return;
  }

  if (scheduledIntentPrefetches.has(key)) {
    return;
  }

  scheduledIntentPrefetches.add(key);
  globalThis.setTimeout(() => {
    scheduledIntentPrefetches.delete(key);
    prefetchSilently(queryClient, options);
  }, INTENT_PREFETCH_POLICY.delayMs);
}

export type { RoutePrefetchClient };
export { prefetchRouteQuery, prefetchRouteQueryOnIntent };
