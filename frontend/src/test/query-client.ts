import { type DefaultOptions, QueryClient } from "@tanstack/react-query";

export function createTestQueryClient() {
  const queries: NonNullable<DefaultOptions["queries"]> = {
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
  };
  queries.experimental_prefetchInRender = true;

  return new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      queries,
    },
  });
}
