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
  useQueryClient,
  useQuery as useTanStackQuery,
} from "@tanstack/react-query";
import { buildInstanceName } from "@/lib/console-resources";
import { logger } from "@/lib/diagnostics";
import { paginateAll } from "@/lib/paginate-all";
import { QUERY_STALE_TIME, RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import {
  type Instance,
  InstanceService,
  type ListInstancesResponse,
  ListInstancesResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import {
  checkInstanceActivity,
  checkInstanceHealth,
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

function queryKeyReferencesInstanceResource(
  value: unknown,
  instanceName: string
): boolean {
  if (typeof value === "string") {
    return value === instanceName || value.startsWith(`${instanceName}/`);
  }
  if (Array.isArray(value)) {
    return value.some((part) =>
      queryKeyReferencesInstanceResource(part, instanceName)
    );
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value).some((part) =>
      queryKeyReferencesInstanceResource(part, instanceName)
    );
  }
  return false;
}

function orderInstancesByDisplayName(first: Instance, second: Instance) {
  return (
    first.displayName.localeCompare(second.displayName) ||
    first.name.localeCompare(second.name)
  );
}

function upsertInstance(instances: Instance[], instance: Instance) {
  return [
    ...instances.filter((item) => item.name !== instance.name),
    instance,
  ].sort(orderInstancesByDisplayName);
}

function runInstanceMutationCacheFollowUp({
  instanceName,
  queryClient,
  transport,
  updateInstances,
}: {
  instanceName: string;
  queryClient: QueryClient;
  transport: Transport;
  updateInstances: ((instances: Instance[]) => Instance[]) | undefined;
}) {
  if (instanceName) {
    queryClient.removeQueries({
      predicate: (query) =>
        queryKeyReferencesInstanceResource(query.queryKey, instanceName),
    });
  }

  if (updateInstances) {
    const { queryKey } = listAllInstancesQueryOptions({ transport });
    queryClient.setQueryData<ListInstancesResponse>(queryKey, (current) =>
      current
        ? create(ListInstancesResponseSchema, {
            instances: updateInstances(current.instances),
            nextPageToken: current.nextPageToken,
          })
        : current
    );
  }

  refreshAllInstancesCache({ queryClient, transport }).catch((error) => {
    logger.warn("Instance mutation cache refresh failed", {
      error: error instanceof Error ? error.message : String(error),
      instanceName,
    });
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
  const cacheQueryOptions = listAllInstancesQueryOptions({
    input: input ?? DEFAULT_ALL_INSTANCES_QUERY_INPUT,
    transport,
  });
  await queryClient.cancelQueries(
    { exact: true, queryKey: cacheQueryOptions.queryKey },
    { revert: false, silent: true }
  );
  return await queryClient.fetchQuery({
    ...cacheQueryOptions,
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

export function useCheckInstanceHealthQuery(
  input?:
    | MessageInitShape<(typeof checkInstanceHealth)["input"]>
    | SkipToken
    | undefined,
  options?: ConnectUseQueryOptions<(typeof checkInstanceHealth)["output"]>
) {
  return useConnectQuery(checkInstanceHealth, input, options);
}

export function useCheckInstanceActivityQuery(
  input?:
    | MessageInitShape<(typeof checkInstanceActivity)["input"]>
    | SkipToken
    | undefined,
  options?: ConnectUseQueryOptions<(typeof checkInstanceActivity)["output"]>
) {
  return useConnectQuery(checkInstanceActivity, input, options);
}

export function useCreateInstanceMutation(
  options?: UseMutationOptions<
    (typeof createInstance)["input"],
    (typeof createInstance)["output"]
  >
) {
  const contextTransport = useTransport();
  const queryClient = useQueryClient();
  const transport = options?.transport ?? contextTransport;

  return useMutation(createInstance, {
    ...options,
    onSuccess: async (data, variables, onMutateResult, context) => {
      const createdInstance = data.instance;
      runInstanceMutationCacheFollowUp({
        instanceName:
          createdInstance?.name ||
          (variables.instanceId ? buildInstanceName(variables.instanceId) : ""),
        queryClient,
        transport,
        updateInstances: createdInstance
          ? (instances) => upsertInstance(instances, createdInstance)
          : undefined,
      });
      await options?.onSuccess?.(data, variables, onMutateResult, context);
    },
    transport,
  });
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
  const contextTransport = useTransport();
  const queryClient = useQueryClient();
  const transport = options?.transport ?? contextTransport;

  return useMutation(updateInstance, {
    ...options,
    onSuccess: async (data, variables, onMutateResult, context) => {
      const updatedInstance = data.instance;
      runInstanceMutationCacheFollowUp({
        instanceName: updatedInstance?.name || variables.instance?.name || "",
        queryClient,
        transport,
        updateInstances: updatedInstance
          ? (instances) => upsertInstance(instances, updatedInstance)
          : undefined,
      });
      await options?.onSuccess?.(data, variables, onMutateResult, context);
    },
    transport,
  });
}

export function useDeleteInstanceMutation(
  options?: UseMutationOptions<
    (typeof deleteInstance)["input"],
    (typeof deleteInstance)["output"]
  >
) {
  const contextTransport = useTransport();
  const queryClient = useQueryClient();
  const transport = options?.transport ?? contextTransport;

  return useMutation(deleteInstance, {
    ...options,
    onSuccess: async (data, variables, onMutateResult, context) => {
      runInstanceMutationCacheFollowUp({
        instanceName: variables.name ?? "",
        queryClient,
        transport,
        updateInstances: variables.name
          ? (instances) =>
              instances.filter((instance) => instance.name !== variables.name)
          : undefined,
      });
      await options?.onSuccess?.(data, variables, onMutateResult, context);
    },
    transport,
  });
}

export { DEFAULT_ALL_INSTANCES_QUERY_INPUT };
