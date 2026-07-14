import type { MessageInitShape } from "@bufbuild/protobuf";
import { createClient, type Transport } from "@connectrpc/connect";
import {
  type UseQueryOptions as ConnectUseQueryOptions,
  useQuery as useConnectQuery,
  useTransport,
} from "@connectrpc/connect-query";
import type { SkipToken } from "@connectrpc/connect-query-core";
import { createQueryOptions } from "@connectrpc/connect-query-core";
import { type InfiniteData, useInfiniteQuery } from "@tanstack/react-query";
import { buildSchemaName, buildTableName } from "@/lib/console-resources";
import { RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import {
  type ListTablesResponse,
  TableService,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  getTable,
  getTablePartitionMetadata,
  listTableColumns,
  listTableConstraints,
  listTableIndexes,
  listTablePolicies,
  type listTables,
  listTableTriggers,
} from "@/protogen/querylane/console/v1alpha1/table-TableService_connectquery";

interface ListAllQueryOptions {
  enabled?: boolean;
  refetchOnWindowFocus?: boolean;
}

const EXPLORER_CATALOG_PAGE_SIZE = 100;

function fetchTablesPage(
  transport: Transport,
  input?: MessageInitShape<(typeof listTables)["input"]>,
  pageToken = ""
) {
  const client = createClient(TableService, transport);
  return client.listTables({
    ...(input ?? {}),
    pageToken,
  });
}

export function useGetTableQuery(name: string | undefined) {
  return useConnectQuery(getTable, name ? { name } : undefined, {
    ...RESOURCE_QUERY_OPTIONS.tableMetadata,
    enabled: Boolean(name),
  });
}

export function useListTablesInfiniteQuery(
  input?: MessageInitShape<(typeof listTables)["input"]>,
  options?: ListAllQueryOptions
) {
  const transport = useTransport();

  return useInfiniteQuery<
    ListTablesResponse,
    Error,
    InfiniteData<ListTablesResponse>,
    readonly ["console", "tables", "list-pages", typeof input | null],
    string
  >({
    enabled: options?.enabled ?? true,
    getNextPageParam: (lastPage: ListTablesResponse) =>
      lastPage.nextPageToken || undefined,
    initialPageParam: "",
    queryFn: ({ pageParam }) => fetchTablesPage(transport, input, pageParam),
    queryKey: ["console", "tables", "list-pages", input ?? null] as const,
    ...RESOURCE_QUERY_OPTIONS.tableMetadata,
  });
}

export function tablesForSchemaQueryInput({
  databaseId,
  instanceId,
  schemaId,
  filter,
  orderBy = "name asc",
}: {
  databaseId: string;
  filter?: string | undefined;
  instanceId: string;
  orderBy?: string | undefined;
  schemaId: string;
}) {
  return {
    ...(filter ? { filter } : {}),
    orderBy,
    pageSize: EXPLORER_CATALOG_PAGE_SIZE,
    parent: buildSchemaName(instanceId, databaseId, schemaId),
  } as const satisfies MessageInitShape<(typeof listTables)["input"]>;
}

export function tableDetailQueryOptions({
  databaseId,
  instanceId,
  schemaId,
  tableId,
  transport,
}: {
  databaseId: string;
  instanceId: string;
  schemaId: string;
  tableId: string;
  transport: Transport;
}) {
  const parent = buildTableName({ instanceId, databaseId, schemaId, tableId });
  const common = {
    ...RESOURCE_QUERY_OPTIONS.tableMetadata,
  } as const;

  return [
    {
      ...createQueryOptions(listTableColumns, { parent }, { transport }),
      ...common,
    },
    {
      ...createQueryOptions(listTableIndexes, { parent }, { transport }),
      ...common,
    },
    {
      ...createQueryOptions(listTableConstraints, { parent }, { transport }),
      ...common,
    },
    {
      ...createQueryOptions(listTablePolicies, { parent }, { transport }),
      ...common,
    },
    {
      ...createQueryOptions(listTableTriggers, { parent }, { transport }),
      ...common,
    },
    {
      ...createQueryOptions(
        getTablePartitionMetadata,
        { name: parent },
        { transport }
      ),
      ...common,
    },
  ] as const;
}

export function assertNoUnhandledTableDetailQueries(
  queries: readonly []
): void {
  if (queries.length > 0) {
    throw new Error("Unhandled table detail query options");
  }
}

export function useListTableColumnsQuery(
  input?:
    | MessageInitShape<(typeof listTableColumns)["input"]>
    | SkipToken
    | undefined,
  options?: ConnectUseQueryOptions<(typeof listTableColumns)["output"]>
) {
  return useConnectQuery(listTableColumns, input, {
    ...RESOURCE_QUERY_OPTIONS.tableMetadata,
    ...options,
  });
}

export function useGetTablePartitionMetadataQuery(
  name: string | undefined,
  options?: ConnectUseQueryOptions<(typeof getTablePartitionMetadata)["output"]>
) {
  return useConnectQuery(
    getTablePartitionMetadata,
    name ? { name } : undefined,
    {
      ...RESOURCE_QUERY_OPTIONS.tableMetadata,
      ...options,
      enabled: (options?.enabled ?? true) && Boolean(name),
    }
  );
}

export function useListTableConstraintsQuery(
  input?:
    | MessageInitShape<(typeof listTableConstraints)["input"]>
    | SkipToken
    | undefined,
  options?: ConnectUseQueryOptions<(typeof listTableConstraints)["output"]>
) {
  return useConnectQuery(listTableConstraints, input, {
    ...RESOURCE_QUERY_OPTIONS.tableMetadata,
    ...options,
  });
}

export function useListTableIndexesQuery(
  input?:
    | MessageInitShape<(typeof listTableIndexes)["input"]>
    | SkipToken
    | undefined,
  options?: ConnectUseQueryOptions<(typeof listTableIndexes)["output"]>
) {
  return useConnectQuery(listTableIndexes, input, {
    ...RESOURCE_QUERY_OPTIONS.tableMetadata,
    ...options,
  });
}

export function useListTablePoliciesQuery(
  input?:
    | MessageInitShape<(typeof listTablePolicies)["input"]>
    | SkipToken
    | undefined,
  options?: ConnectUseQueryOptions<(typeof listTablePolicies)["output"]>
) {
  return useConnectQuery(listTablePolicies, input, {
    ...RESOURCE_QUERY_OPTIONS.tableMetadata,
    ...options,
  });
}

export function useListTableTriggersQuery(
  input?:
    | MessageInitShape<(typeof listTableTriggers)["input"]>
    | SkipToken
    | undefined,
  options?: ConnectUseQueryOptions<(typeof listTableTriggers)["output"]>
) {
  return useConnectQuery(listTableTriggers, input, {
    ...RESOURCE_QUERY_OPTIONS.tableMetadata,
    ...options,
  });
}
