import type { MessageInitShape } from "@bufbuild/protobuf";
import { createClient, type Transport } from "@connectrpc/connect";
import {
  useQuery as useConnectQuery,
  useTransport,
} from "@connectrpc/connect-query";
import { type InfiniteData, useInfiniteQuery } from "@tanstack/react-query";
import { buildDatabaseName } from "@/lib/console-resources";
import { RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import {
  type ListSchemasResponse,
  SchemaService,
} from "@/protogen/querylane/console/v1alpha1/schema_pb";
import {
  getSchema,
  type listSchemas,
} from "@/protogen/querylane/console/v1alpha1/schema-SchemaService_connectquery";

interface ListAllQueryOptions {
  enabled?: boolean;
  refetchOnWindowFocus?: boolean;
}

const EXPLORER_CATALOG_PAGE_SIZE = 100;

function fetchSchemasPage(
  transport: Transport,
  input?: MessageInitShape<(typeof listSchemas)["input"]>,
  pageToken = ""
) {
  const client = createClient(SchemaService, transport);
  return client.listSchemas({
    ...(input ?? {}),
    pageToken,
  });
}

export function useGetSchemaQuery(name: string | undefined) {
  return useConnectQuery(getSchema, name ? { name } : undefined, {
    ...RESOURCE_QUERY_OPTIONS.schemaList,
    enabled: Boolean(name),
  });
}

export function useListSchemasInfiniteQuery(
  input?: MessageInitShape<(typeof listSchemas)["input"]>,
  options?: ListAllQueryOptions
) {
  const transport = useTransport();

  return useInfiniteQuery<
    ListSchemasResponse,
    Error,
    InfiniteData<ListSchemasResponse>,
    readonly ["console", "schemas", "list-pages", typeof input | null],
    string
  >({
    enabled: options?.enabled ?? true,
    getNextPageParam: (lastPage: ListSchemasResponse) =>
      lastPage.nextPageToken || undefined,
    initialPageParam: "",
    queryFn: ({ pageParam }) => fetchSchemasPage(transport, input, pageParam),
    queryKey: ["console", "schemas", "list-pages", input ?? null] as const,
    ...RESOURCE_QUERY_OPTIONS.schemaList,
  });
}

export function schemasForDatabaseQueryInput({
  databaseId,
  instanceId,
  filter,
}: {
  databaseId: string;
  filter?: string | undefined;
  instanceId: string;
}) {
  return {
    ...(filter ? { filter } : {}),
    orderBy: "name asc",
    pageSize: EXPLORER_CATALOG_PAGE_SIZE,
    parent: buildDatabaseName(instanceId, databaseId),
  } as const satisfies MessageInitShape<(typeof listSchemas)["input"]>;
}
