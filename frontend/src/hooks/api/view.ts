import type { MessageInitShape } from "@bufbuild/protobuf";
import { createClient, type Transport } from "@connectrpc/connect";
import {
  useQuery as useConnectQuery,
  useTransport,
} from "@connectrpc/connect-query";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { buildSchemaName } from "@/lib/console-resources";
import { RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import {
  type ListViewsResponse,
  type RefreshMaterializedViewMode,
  ViewService,
  ViewView,
} from "@/protogen/querylane/console/v1alpha1/view_pb";
import {
  getView,
  getViewDependencies,
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

function useGetViewDependenciesQuery(name: string | undefined) {
  return useConnectQuery(getViewDependencies, name ? { name } : undefined, {
    ...RESOURCE_QUERY_OPTIONS.tableMetadata,
    enabled: Boolean(name),
  });
}

function queryKeyContainsResourceName(value: unknown, name: string): boolean {
  if (value === name) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some((item) => queryKeyContainsResourceName(item, name));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some((item) =>
      queryKeyContainsResourceName(item, name)
    );
  }
  return false;
}

interface RefreshMaterializedViewInput {
  mode: RefreshMaterializedViewMode;
  name: string;
  signal: AbortSignal;
}

function useRefreshMaterializedViewMutation() {
  const queryClient = useQueryClient();
  const transport = useTransport();
  const client = createClient(ViewService, transport);

  return useMutation({
    mutationFn: ({ mode, name, signal }: RefreshMaterializedViewInput) =>
      client.refreshMaterializedView({ mode, name }, { signal }),
    onSuccess: (_response, input) =>
      queryClient.invalidateQueries({
        predicate: (query) =>
          queryKeyContainsResourceName(query.queryKey, input.name),
      }),
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

export {
  useGetViewDependenciesQuery,
  useGetViewQuery,
  useListViewsInfiniteQuery,
  useRefreshMaterializedViewMutation,
  viewsForSchemaQueryInput,
};
