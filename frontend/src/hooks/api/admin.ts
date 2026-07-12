import { createClient, type Transport } from "@connectrpc/connect";
import {
  useQuery as useConnectQuery,
  useTransport,
} from "@connectrpc/connect-query";
import { type InfiniteData, useInfiniteQuery } from "@tanstack/react-query";
import {
  ADMIN_OPS_REFETCH_INTERVALS,
  RESOURCE_QUERY_OPTIONS,
} from "@/lib/query-policy";
import {
  AdminService,
  type ListAdminRunnerExecutionsResponse,
} from "@/protogen/querylane/console/v1alpha1/admin_pb";
import {
  getMetricsStorageStats,
  listCatalogSyncStates,
  listReplicas,
} from "@/protogen/querylane/console/v1alpha1/admin-AdminService_connectquery";

const JOB_QUEUE_PAGE_SIZE = 50;
/**
 * Catalog scopes and replicas are small sets (scopes scale with browsed
 * catalog objects, replicas with deployment size); a single max-size page is
 * plenty for the admin panel v1.
 */
const SINGLE_PAGE_SIZE = 1000;

function fetchRunnerExecutionsPage(
  transport: Transport,
  filter: string,
  pageToken = ""
) {
  const client = createClient(AdminService, transport);
  return client.listAdminRunnerExecutions({
    ...(filter ? { filter } : {}),
    pageSize: JOB_QUEUE_PAGE_SIZE,
    pageToken,
  });
}

export function useListReplicasQuery() {
  return useConnectQuery(
    listReplicas,
    { pageSize: SINGLE_PAGE_SIZE },
    {
      ...RESOURCE_QUERY_OPTIONS.adminOps,
      refetchInterval: ADMIN_OPS_REFETCH_INTERVALS.replicas,
    }
  );
}

export function useAdminRunnerExecutionsInfiniteQuery(filter: string) {
  const transport = useTransport();

  return useInfiniteQuery<
    ListAdminRunnerExecutionsResponse,
    Error,
    InfiniteData<ListAdminRunnerExecutionsResponse>,
    readonly ["admin", "runner-executions", "list-pages", string],
    string
  >({
    getNextPageParam: (lastPage: ListAdminRunnerExecutionsResponse) =>
      lastPage.nextPageToken || undefined,
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      fetchRunnerExecutionsPage(transport, filter, pageParam),
    queryKey: ["admin", "runner-executions", "list-pages", filter] as const,
    refetchInterval: ADMIN_OPS_REFETCH_INTERVALS.jobQueue,
    ...RESOURCE_QUERY_OPTIONS.adminOps,
  });
}

export function useListCatalogSyncStatesQuery() {
  return useConnectQuery(
    listCatalogSyncStates,
    { pageSize: SINGLE_PAGE_SIZE },
    {
      ...RESOURCE_QUERY_OPTIONS.adminOps,
      refetchInterval: ADMIN_OPS_REFETCH_INTERVALS.catalogSync,
    }
  );
}

export function useGetMetricsStorageStatsQuery() {
  return useConnectQuery(
    getMetricsStorageStats,
    {},
    {
      ...RESOURCE_QUERY_OPTIONS.adminOps,
      refetchInterval: ADMIN_OPS_REFETCH_INTERVALS.storage,
    }
  );
}

export { JOB_QUEUE_PAGE_SIZE };
