import { handleQueryActionError } from "@/lib/query-action-errors";

interface QueryLike<T = unknown> {
  data: T | undefined;
  error: unknown;
  isFetching: boolean;
  isPending: boolean;
  refetch: () => Promise<unknown>;
}

interface ResourcePageStateProps {
  area: string;
  error: unknown;
  hasData: boolean;
  loading: boolean;
  retry: () => Promise<unknown>;
}

interface ResourceLoader<T = unknown> {
  data: T | undefined;
  error: unknown;
  hasData: boolean;
  isFetching: boolean;
  isPending: boolean;
  pageStateProps: ResourcePageStateProps;
  retry: () => Promise<unknown>;
}

export function createResourceLoader<T>(
  query: QueryLike<T>,
  area: string
): ResourceLoader<T> {
  const hasData = query.data != null;

  const retry = () =>
    query.refetch().catch((error: unknown) => {
      handleQueryActionError(error, { action: "retry", area });
    });

  return {
    data: query.data,
    error: query.error,
    hasData,
    isFetching: query.isFetching,
    isPending: query.isPending,
    pageStateProps: {
      area,
      error: query.error,
      hasData,
      loading: query.isPending,
      retry,
    },
    retry,
  };
}
