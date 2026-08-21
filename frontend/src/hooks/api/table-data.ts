import { isMessage } from "@bufbuild/protobuf";
import {
  type UseQueryOptions as ConnectUseQueryOptions,
  type UseMutationOptions,
  useQuery as useConnectQuery,
  useMutation,
  useTransport,
} from "@connectrpc/connect-query";
import { createQueryOptions } from "@connectrpc/connect-query-core";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import { prefetchRouteQuery } from "@/lib/route-prefetch";
import {
  type ReadRowsRequest,
  type ReadRowsResponse,
  ReadRowsResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import {
  readCellValue,
  readRows,
} from "@/protogen/querylane/console/v1alpha1/table_data-TableDataService_connectquery";

interface UseReadRowsQueryOptions {
  enabled?: boolean;
  keepPreviousData?: boolean;
}

function queryKeyContainsTableName(value: unknown, tableName: string): boolean {
  if (value === tableName) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some((item) => queryKeyContainsTableName(item, tableName));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some((item) =>
      queryKeyContainsTableName(item, tableName)
    );
  }
  return false;
}

function findLastSuccessfulReadRows(
  queryClient: QueryClient,
  currentQueryKey: readonly unknown[]
): ReadRowsResponse | undefined {
  let latest: { data: ReadRowsResponse; updatedAt: number } | undefined;
  const requestIdentity = JSON.stringify(currentQueryKey, (key, value) =>
    key === "pageToken" ? undefined : value
  );

  for (const query of queryClient.getQueryCache().findAll()) {
    if (
      query.state.status !== "success" ||
      JSON.stringify(query.queryKey, (key, value) =>
        key === "pageToken" ? undefined : value
      ) !== requestIdentity ||
      !isMessage(query.state.data, ReadRowsResponseSchema)
    ) {
      continue;
    }
    if (!latest || query.state.dataUpdatedAt > latest.updatedAt) {
      latest = {
        data: query.state.data,
        updatedAt: query.state.dataUpdatedAt,
      };
    }
  }

  return latest?.data;
}

function useReadRowsQuery(
  request: ReadRowsRequest,
  options?: UseReadRowsQueryOptions
) {
  const queryClient = useQueryClient();
  const transport = useTransport();
  const baseEnabled = options?.enabled ?? true;
  const connectOptions: ConnectUseQueryOptions<(typeof readRows)["output"]> = {
    ...RESOURCE_QUERY_OPTIONS.tableRows,
    enabled: baseEnabled && request.name !== "",
  };
  if (options?.keepPreviousData) {
    connectOptions.placeholderData = (previous, previousQuery) =>
      queryKeyContainsTableName(previousQuery?.queryKey, request.name)
        ? previous
        : undefined;
  }
  const query = useConnectQuery(readRows, request, connectOptions);
  const currentQueryKey = createQueryOptions(readRows, request, {
    transport,
  }).queryKey;

  return {
    ...query,
    lastSuccessfulData:
      query.data && !query.isPlaceholderData
        ? query.data
        : findLastSuccessfulReadRows(queryClient, currentQueryKey),
  };
}

function useReadRowsQueryActions(request: ReadRowsRequest) {
  const queryClient = useQueryClient();
  const transport = useTransport();
  const queryOptions = {
    ...createQueryOptions(readRows, request, { transport }),
    ...RESOURCE_QUERY_OPTIONS.tableRows,
  };

  return {
    fetch: () => queryClient.fetchQuery(queryOptions),
    getState: () => queryClient.getQueryState(queryOptions.queryKey),
    prefetch: () => prefetchRouteQuery(queryClient, queryOptions),
  };
}

function useReadCellValueMutation(
  options?: UseMutationOptions<
    (typeof readCellValue)["input"],
    (typeof readCellValue)["output"]
  >
) {
  return useMutation(readCellValue, options);
}

export { useReadCellValueMutation, useReadRowsQuery, useReadRowsQueryActions };
