import type {
  QueryClient,
  QueryExecuteOptions,
  QueryKey,
} from "@tanstack/react-query";

import { logger } from "@/lib/diagnostics";

type RoutePrefetchClient = Pick<QueryClient, "query">;

/** Start deferred data work; mounted Query observers own loading/error UI. */
async function prefetchRouteQuery<
  QueryFnData,
  QueryError,
  QueryData,
  PrefetchQueryKey extends QueryKey,
>(
  queryClient: RoutePrefetchClient,
  options: QueryExecuteOptions<
    QueryFnData,
    QueryError,
    QueryData,
    QueryData,
    PrefetchQueryKey
  >
) {
  try {
    await queryClient.query({
      ...options,
      meta: { ...options.meta, appErrorSurface: "silent" },
    });
  } catch (error) {
    logger.warn("Route data prefetch failed", { error });
  }
}

export type { RoutePrefetchClient };
export { prefetchRouteQuery };
