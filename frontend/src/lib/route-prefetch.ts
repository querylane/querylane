import type {
  FetchQueryOptions,
  QueryClient,
  QueryKey,
} from "@tanstack/react-query";

type RoutePrefetchClient = Pick<QueryClient, "prefetchQuery">;

/** Start deferred data work; mounted Query observers own loading/error UI. */
function prefetchRouteQuery<
  QueryFnData,
  QueryError,
  QueryData,
  PrefetchQueryKey extends QueryKey,
>(
  queryClient: RoutePrefetchClient,
  options: FetchQueryOptions<
    QueryFnData,
    QueryError,
    QueryData,
    PrefetchQueryKey
  >
) {
  // Query owns freshness, invalidation, in-flight deduplication and errors.
  return queryClient.prefetchQuery({
    ...options,
    meta: { ...options.meta, appErrorSurface: "silent" },
  });
}

export type { RoutePrefetchClient };
export { prefetchRouteQuery };
