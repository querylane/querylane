import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { createClient, type Transport } from "@connectrpc/connect";
import {
  type UseQueryOptions as ConnectUseQueryOptions,
  type UseMutationOptions,
  useQuery as useConnectQuery,
  useMutation,
  useTransport,
} from "@connectrpc/connect-query";
import type { SkipToken } from "@connectrpc/connect-query-core";
import { createQueryOptions } from "@connectrpc/connect-query-core";
import {
  type QueryClient,
  queryOptions,
  useQuery as useTanStackQuery,
} from "@tanstack/react-query";
import { buildInstanceName } from "@/lib/console-resources";
import { paginateAll } from "@/lib/paginate-all";
import { QUERY_STALE_TIME, RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import {
  InstanceService,
  ListInstancesResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import {
  createInstance,
  deleteInstance,
  getInstance,
  getInstanceOverview,
  type listInstances,
  testInstanceConnection,
  updateInstance,
} from "@/protogen/querylane/console/v1alpha1/instance-InstanceService_connectquery";

interface ListAllQueryOptions {
  enabled?: boolean;
  refetchOnReconnect?: boolean;
  refetchOnWindowFocus?: boolean;
}

const DEFAULT_ALL_INSTANCES_QUERY_INPUT = {
  orderBy: "display_name asc",
  pageSize: 1000,
} as const satisfies MessageInitShape<(typeof listInstances)["input"]>;

function getListAllInstancesQueryKey(
  input?: MessageInitShape<(typeof listInstances)["input"]>
) {
  return ["console", "instances", "list-all", input ?? null] as const;
}

async function fetchAllInstances(
  transport: Transport,
  input?: MessageInitShape<(typeof listInstances)["input"]>
) {
  const client = createClient(InstanceService, transport);
  const instances = await paginateAll(
    (pageToken) =>
      client.listInstances({
        ...(input ?? {}),
        pageToken: pageToken ?? "",
      }),
    (response) => response.instances
  );

  return create(ListInstancesResponseSchema, {
    instances,
    nextPageToken: "",
  });
}

export function listAllInstancesQueryOptions({
  input = DEFAULT_ALL_INSTANCES_QUERY_INPUT,
  transport,
}: {
  input?: MessageInitShape<(typeof listInstances)["input"]>;
  transport: Transport;
}) {
  return queryOptions({
    queryFn: () => fetchAllInstances(transport, input),
    queryKey: getListAllInstancesQueryKey(input),
    ...RESOURCE_QUERY_OPTIONS.instanceList,
  });
}

export function selectedInstanceQueryOptions({
  instanceId,
  transport,
}: {
  instanceId: string;
  transport: Transport;
}) {
  return {
    ...createQueryOptions(
      getInstance,
      { name: buildInstanceName(instanceId) },
      { transport }
    ),
    ...RESOURCE_QUERY_OPTIONS.instanceDetail,
  };
}

export async function refreshAllInstancesCache({
  input,
  queryClient,
  transport,
}: {
  input?: MessageInitShape<(typeof listInstances)["input"]>;
  queryClient: QueryClient;
  transport: Transport;
}) {
  return await queryClient.fetchQuery({
    ...listAllInstancesQueryOptions({
      input: input ?? DEFAULT_ALL_INSTANCES_QUERY_INPUT,
      transport,
    }),
    staleTime: QUERY_STALE_TIME.immediate,
  });
}

export function useListAllInstancesQuery(
  input?: MessageInitShape<(typeof listInstances)["input"]>,
  options?: ListAllQueryOptions
) {
  const transport = useTransport();

  return useTanStackQuery({
    ...listAllInstancesQueryOptions({
      input: input ?? DEFAULT_ALL_INSTANCES_QUERY_INPUT,
      transport,
    }),
    enabled: options?.enabled ?? true,
    ...(options?.refetchOnReconnect === undefined
      ? {}
      : { refetchOnReconnect: options.refetchOnReconnect }),
    ...(options?.refetchOnWindowFocus === undefined
      ? {}
      : { refetchOnWindowFocus: options.refetchOnWindowFocus }),
  });
}

export function useGetInstanceQuery(
  input?:
    | MessageInitShape<(typeof getInstance)["input"]>
    | SkipToken
    | undefined,
  options?: ConnectUseQueryOptions<(typeof getInstance)["output"]>
) {
  return useConnectQuery(getInstance, input, {
    ...RESOURCE_QUERY_OPTIONS.instanceDetail,
    ...options,
  });
}

export function useGetInstanceOverviewQuery(
  input?:
    | MessageInitShape<(typeof getInstanceOverview)["input"]>
    | SkipToken
    | undefined,
  options?: ConnectUseQueryOptions<(typeof getInstanceOverview)["output"]>
) {
  return useConnectQuery(getInstanceOverview, input, options);
}

export function useCreateInstanceMutation(
  options?: UseMutationOptions<
    (typeof createInstance)["input"],
    (typeof createInstance)["output"]
  >
) {
  return useMutation(createInstance, options);
}

export function useTestInstanceConnectionMutation(
  options?: UseMutationOptions<
    (typeof testInstanceConnection)["input"],
    (typeof testInstanceConnection)["output"]
  >
) {
  return useMutation(testInstanceConnection, options);
}

export function useUpdateInstanceMutation(
  options?: UseMutationOptions<
    (typeof updateInstance)["input"],
    (typeof updateInstance)["output"]
  >
) {
  return useMutation(updateInstance, options);
}

export function useDeleteInstanceMutation(
  options?: UseMutationOptions<
    (typeof deleteInstance)["input"],
    (typeof deleteInstance)["output"]
  >
) {
  return useMutation(deleteInstance, options);
}

export { DEFAULT_ALL_INSTANCES_QUERY_INPUT };
