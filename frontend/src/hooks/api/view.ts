import type { MessageInitShape } from "@bufbuild/protobuf";
import { createClient, type Transport } from "@connectrpc/connect";
import {
  useQuery as useConnectQuery,
  useTransport,
} from "@connectrpc/connect-query";
import { type InfiniteData, useInfiniteQuery } from "@tanstack/react-query";
import { buildSchemaName } from "@/lib/console-resources";
import { RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import {
  type ListViewsResponse,
  ViewService,
  ViewView,
} from "@/protogen/querylane/console/v1alpha1/view_pb";
import {
  getView,
  type listViews,
} from "@/protogen/querylane/console/v1alpha1/view-ViewService_connectquery";

interface ListAllQueryOptions {
  enabled?: boolean;
  refetchOnWindowFocus?: boolean;
}

const EXPLORER_CATALOG_PAGE_SIZE = 100;

function fetchViewsPage(
  transport: Transport,
  input?: MessageInitShape<(typeof listViews)["input"]>,
  pageToken = ""
) {
  const client = createClient(ViewService, transport);
  return client.listViews({
    ...(input ?? {}),
    pageToken,
  });
}

function useGetViewQuery(
  name: string | undefined,
  view: ViewView = ViewView.BASIC
) {
  return useConnectQuery(getView, name ? { name, view } : undefined, {
    ...RESOURCE_QUERY_OPTIONS.tableMetadata,
    enabled: Boolean(name),
  });
}

function useListViewsInfiniteQuery(
  input?: MessageInitShape<(typeof listViews)["input"]>,
  options?: ListAllQueryOptions
) {
  const transport = useTransport();

  return useInfiniteQuery<
    ListViewsResponse,
    Error,
    InfiniteData<ListViewsResponse>,
    readonly ["console", "views", "list-pages", typeof input | null],
    string
  >({
    enabled: options?.enabled ?? true,
    getNextPageParam: (lastPage: ListViewsResponse) =>
      lastPage.nextPageToken || undefined,
    initialPageParam: "",
    queryFn: ({ pageParam }) => fetchViewsPage(transport, input, pageParam),
    queryKey: ["console", "views", "list-pages", input ?? null] as const,
    ...RESOURCE_QUERY_OPTIONS.tableMetadata,
  });
}

function viewsForSchemaQueryInput({
  databaseId,
  instanceId,
  schemaId,
  filter,
}: {
  databaseId: string;
  filter?: string | undefined;
  instanceId: string;
  schemaId: string;
}) {
  return {
    ...(filter ? { filter } : {}),
    orderBy: "name asc",
    pageSize: EXPLORER_CATALOG_PAGE_SIZE,
    parent: buildSchemaName(instanceId, databaseId, schemaId),
  } as const satisfies MessageInitShape<(typeof listViews)["input"]>;
}

export { useGetViewQuery, useListViewsInfiniteQuery, viewsForSchemaQueryInput };
