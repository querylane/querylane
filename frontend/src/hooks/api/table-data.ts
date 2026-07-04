import {
  type UseQueryOptions as ConnectUseQueryOptions,
  type UseMutationOptions,
  useQuery as useConnectQuery,
  useMutation,
  useTransport,
} from "@connectrpc/connect-query";
import type { ExportFormat } from "@/features/data-explorer/table-data/selection-formatters";
import {
  exportStreamRows,
  type StreamRowsExportPayloadResult,
  type StreamRowsExportProgress,
} from "@/features/data-explorer/table-data/stream-rows-export";
import { RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import type { ReadRowsRequest } from "@/protogen/querylane/console/v1alpha1/table_data_pb";
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

function useReadRowsQuery(
  request: ReadRowsRequest,
  options?: UseReadRowsQueryOptions
) {
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
  return useConnectQuery(readRows, request, connectOptions);
}

function useReadCellValueMutation(
  options?: UseMutationOptions<
    (typeof readCellValue)["input"],
    (typeof readCellValue)["output"]
  >
) {
  return useMutation(readCellValue, options);
}

function useStreamRowsExporter(): (args: {
  exportFormat: ExportFormat;
  onProgress?: ((progress: StreamRowsExportProgress) => void) | undefined;
  request: ReadRowsRequest;
  signal?: AbortSignal | undefined;
}) => Promise<StreamRowsExportPayloadResult> {
  const transport = useTransport();

  return ({ exportFormat, onProgress, request, signal }) =>
    exportStreamRows({ exportFormat, onProgress, request, signal, transport });
}

export { useReadCellValueMutation, useReadRowsQuery, useStreamRowsExporter };
