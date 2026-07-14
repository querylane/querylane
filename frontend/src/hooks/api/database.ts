import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { createClient, type Transport } from "@connectrpc/connect";
import {
  type UseQueryOptions as ConnectUseQueryOptions,
  useQuery as useConnectQuery,
  useTransport,
} from "@connectrpc/connect-query";
import type { SkipToken } from "@connectrpc/connect-query-core";
import { createQueryOptions } from "@connectrpc/connect-query-core";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { createConnectListAllQueryKey } from "@/lib/connect-query-key";
import { buildDatabaseName, buildInstanceName } from "@/lib/console-resources";
import { paginateAll } from "@/lib/paginate-all";
import { RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import {
  DatabaseService,
  ListDatabasesResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/database_pb";
import {
  getDatabase,
  getDatabaseQueryInsights,
  listDatabases,
} from "@/protogen/querylane/console/v1alpha1/database-DatabaseService_connectquery";

interface ListAllQueryOptions {
  enabled?: boolean;
  refetchOnWindowFocus?: boolean;
}

async function fetchAllDatabases(
  transport: Transport,
  input?: MessageInitShape<(typeof listDatabases)["input"]>
) {
  const client = createClient(DatabaseService, transport);
  const databases = await paginateAll(
    (pageToken) =>
      client.listDatabases({
        ...(input ?? {}),
        pageToken: pageToken ?? "",
      }),
    (response) => response.databases
  );

  return create(ListDatabasesResponseSchema, {
    databases,
    nextPageToken: "",
  });
}

export function listAllDatabasesQueryOptions({
  input,
  transport,
}: {
  input?: MessageInitShape<(typeof listDatabases)["input"]>;
  transport: Transport;
}) {
  return queryOptions({
    queryFn: () => fetchAllDatabases(transport, input),
    queryKey: createConnectListAllQueryKey({
      input,
      method: listDatabases,
      transport,
    }),
    ...RESOURCE_QUERY_OPTIONS.databaseList,
  });
}

export function selectedDatabaseQueryOptions({
  databaseId,
  instanceId,
  transport,
}: {
  databaseId: string;
  instanceId: string;
  transport: Transport;
}) {
  return {
    ...createQueryOptions(
      getDatabase,
      { name: buildDatabaseName(instanceId, databaseId) },
      { transport }
    ),
    ...RESOURCE_QUERY_OPTIONS.selectedDatabase,
  };
}

export function databaseQueryInsightsQueryOptions({
  databaseId,
  instanceId,
  transport,
}: {
  databaseId: string;
  instanceId: string;
  transport: Transport;
}) {
  return {
    ...createQueryOptions(
      getDatabaseQueryInsights,
      { name: buildDatabaseName(instanceId, databaseId) },
      { transport }
    ),
    ...RESOURCE_QUERY_OPTIONS.selectedDatabase,
  };
}

export function databasesForInstanceQueryInput(instanceId: string) {
  return {
    orderBy: "name asc",
    pageSize: 1000,
    parent: buildInstanceName(instanceId),
  } as const satisfies MessageInitShape<(typeof listDatabases)["input"]>;
}

export function useListAllDatabasesQuery(
  input?: MessageInitShape<(typeof listDatabases)["input"]>,
  options?: ListAllQueryOptions
) {
  const transport = useTransport();

  return useQuery({
    ...listAllDatabasesQueryOptions({
      ...(input === undefined ? {} : { input }),
      transport,
    }),
    enabled: options?.enabled ?? true,
    ...(options?.refetchOnWindowFocus === undefined
      ? {}
      : { refetchOnWindowFocus: options.refetchOnWindowFocus }),
  });
}

export function useGetDatabaseQuery(
  input?:
    | MessageInitShape<(typeof getDatabase)["input"]>
    | SkipToken
    | undefined,
  options?: ConnectUseQueryOptions<(typeof getDatabase)["output"]>
) {
  return useConnectQuery(getDatabase, input, {
    ...RESOURCE_QUERY_OPTIONS.selectedDatabase,
    ...options,
  });
}

export function useGetDatabaseQueryInsightsQuery(
  input?:
    | MessageInitShape<(typeof getDatabaseQueryInsights)["input"]>
    | SkipToken
    | undefined,
  options?: ConnectUseQueryOptions<(typeof getDatabaseQueryInsights)["output"]>
) {
  return useConnectQuery(getDatabaseQueryInsights, input, {
    ...RESOURCE_QUERY_OPTIONS.selectedDatabase,
    ...options,
  });
}
