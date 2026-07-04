import { create } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import { createQueryOptions } from "@connectrpc/connect-query-core";
import type { QueryClient } from "@tanstack/react-query";
import {
  databasesForInstanceQueryInput,
  listAllDatabasesQueryOptions,
  selectedDatabaseQueryOptions,
} from "@/hooks/api/database";
import {
  extensionsForDatabaseQueryInput,
  listAllExtensionsQueryOptions,
} from "@/hooks/api/extension";
import {
  listAllInstancesQueryOptions,
  selectedInstanceQueryOptions,
} from "@/hooks/api/instance";
import { tableDetailQueryOptions } from "@/hooks/api/table";
import { RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import { prefetchRouteQuery } from "@/lib/route-prefetch";
import {
  CellValueMode,
  ReadRowsRequestSchema,
  RowCountMode,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { readRows } from "@/protogen/querylane/console/v1alpha1/table_data-TableDataService_connectquery";

interface RouteDataContext {
  queryClient: QueryClient;
  transport: Transport;
}

interface InstanceRouteParams {
  instanceId: string;
}

interface DatabaseRouteParams extends InstanceRouteParams {
  databaseId: string;
}

interface ExplorerRouteSearch {
  category?: string;
  name?: string;
  schema?: string;
}

interface RouteDataQuery {
  prefetch: (queryClient: QueryClient) => void;
  queryKey: readonly unknown[];
  staleTime?: unknown;
}

function routeDataQuery<
  QueryFnData,
  QueryError,
  QueryData,
  PrefetchQueryKey extends readonly unknown[],
>(
  options: Parameters<
    typeof prefetchRouteQuery<
      QueryFnData,
      QueryError,
      QueryData,
      PrefetchQueryKey
    >
  >[1]
): RouteDataQuery {
  return {
    prefetch: (queryClient) => prefetchRouteQuery(queryClient, options),
    queryKey: options.queryKey,
    staleTime: options.staleTime,
  };
}

function databaseSummaryQueries({
  databaseId,
  instanceId,
  transport,
}: DatabaseRouteParams & { transport: Transport }): RouteDataQuery[] {
  return [
    routeDataQuery(
      selectedDatabaseQueryOptions({
        databaseId,
        instanceId,
        transport,
      })
    ),
  ];
}

function createQueryOptionsForReadRows({
  databaseId,
  instanceId,
  schemaId,
  tableId,
  transport,
}: DatabaseRouteParams & {
  schemaId: string;
  tableId: string;
  transport: Transport;
}) {
  return createQueryOptions(
    readRows,
    create(ReadRowsRequestSchema, {
      cellValueMode: CellValueMode.PREVIEW,
      name: `instances/${instanceId}/databases/${databaseId}/schemas/${schemaId}/tables/${tableId}`,
      pageSize: 50,
      rowCountMode: RowCountMode.ESTIMATE,
    }),
    { transport }
  );
}

export function instanceRouteDataQueries({
  instanceId,
  transport,
}: InstanceRouteParams & { transport: Transport }): RouteDataQuery[] {
  return [
    routeDataQuery(listAllInstancesQueryOptions({ transport })),
    routeDataQuery(selectedInstanceQueryOptions({ instanceId, transport })),
    routeDataQuery(
      listAllDatabasesQueryOptions({
        input: databasesForInstanceQueryInput(instanceId),
        transport,
      })
    ),
  ];
}

export function databaseRouteDataQueries({
  databaseId,
  instanceId,
  transport,
}: DatabaseRouteParams & { transport: Transport }): RouteDataQuery[] {
  return databaseSummaryQueries({ databaseId, instanceId, transport });
}

export function extensionRouteDataQueries({
  databaseId,
  instanceId,
  transport,
}: DatabaseRouteParams & { transport: Transport }): RouteDataQuery[] {
  return [
    ...databaseSummaryQueries({ databaseId, instanceId, transport }),
    routeDataQuery(
      listAllExtensionsQueryOptions({
        input: extensionsForDatabaseQueryInput({ databaseId, instanceId }),
        transport,
      })
    ),
  ];
}

export function explorerRouteDataQueries({
  databaseId,
  instanceId,
  search,
  transport,
}: DatabaseRouteParams & {
  search: ExplorerRouteSearch;
  transport: Transport;
}): RouteDataQuery[] {
  const queries: RouteDataQuery[] = [
    ...databaseSummaryQueries({ databaseId, instanceId, transport }),
  ];

  if (!search.schema) {
    return queries;
  }

  if (search.category !== "tables" || !search.name) {
    return queries;
  }

  const tableDetailQueries = tableDetailQueryOptions({
    databaseId,
    instanceId,
    schemaId: search.schema,
    tableId: search.name,
    transport,
  });
  const [columnsQuery] = tableDetailQueries;

  queries.push(
    routeDataQuery(columnsQuery),
    routeDataQuery({
      ...createQueryOptionsForReadRows({
        databaseId,
        instanceId,
        schemaId: search.schema,
        tableId: search.name,
        transport,
      }),
      ...RESOURCE_QUERY_OPTIONS.tableRows,
    })
  );

  return queries;
}

export function prefetchRouteData(
  context: RouteDataContext,
  queries: RouteDataQuery[]
) {
  for (const query of queries) {
    query.prefetch(context.queryClient);
  }
}
