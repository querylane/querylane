import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { MUTATION_DEFAULTS, QUERY_DEFAULTS } from "@/lib/query-policy";

import { normalizeAppUiError, reportAppUiError } from "@/lib/ui-error";
import type { AppErrorSurface } from "@/lib/ui-error-types";

function getErrorSurface(meta: unknown): AppErrorSurface | null {
  if (typeof meta !== "object" || meta === null) {
    return null;
  }

  const surface = (meta as { appErrorSurface?: AppErrorSurface })
    .appErrorSurface;
  return surface ?? null;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    mutations: MUTATION_DEFAULTS,
    queries: {
      ...QUERY_DEFAULTS,
      throwOnError: (_, query) => getErrorSurface(query.meta) === "route",
    },
  },
  mutationCache: new MutationCache({
    onError: (error, _, __, mutation) => {
      const surface = getErrorSurface(mutation.meta);
      if (surface === "silent") {
        return;
      }

      reportAppUiError(
        normalizeAppUiError(error, {
          area: "mutation",
          source: "mutation",
          surface: surface ?? "toast",
        })
      );
    },
  }),
  queryCache: new QueryCache({
    onError: (error, query) => {
      const surface = getErrorSurface(query.meta);
      if (surface === "route" || surface === "silent") {
        return;
      }

      reportAppUiError(
        normalizeAppUiError(error, {
          area: "query",
          source: "query",
          surface: surface ?? "inline",
        })
      );
    },
  }),
});
