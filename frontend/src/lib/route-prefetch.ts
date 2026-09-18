import type {
  FetchQueryOptions,
  QueryClient,
  QueryKey,
} from "@tanstack/react-query";

import { logger } from "@/lib/diagnostics";

type RoutePrefetchClient = Pick<QueryClient, "query">;

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
  return queryClient
    .query({
      ...options,
      meta: { ...options.meta, appErrorSurface: "silent" },
    })
    .then(() => undefined)
    .catch((error: unknown) => {
      // The cache retains the error for mounted observers and their retry UI.
      logger.warn("Route data prefetch failed", { error });
    });
}

export type { RoutePrefetchClient };
export { prefetchRouteQuery };
