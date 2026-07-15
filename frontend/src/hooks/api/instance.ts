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
  hashKey,
  type QueryClient,
  queryOptions,
  useQueryClient,
  useQuery as useTanStackQuery,
} from "@tanstack/react-query";
import {
  createConnectListAllQueryKey,
  createConnectMethodQueryKey,
} from "@/lib/connect-query-key";
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
  listInstances,
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

function queryKeyIsUnscopedOrUsesTransport(
  value: unknown,
  transportKey: string | undefined
): boolean {
  if (!Array.isArray(value) || value[0] !== "connect-query") {
    return true;
  }
  const [, options] = value;
  return (
    options !== null &&
    typeof options === "object" &&
    "transport" in options &&
    options.transport === transportKey
  );
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

async function refreshInstanceMutationCaches({
  activeDescendantQueryHashes,
  canonicalQueryHash,
  methodQueryKey,
  queryClient,
  transport,
}: {
  activeDescendantQueryHashes: ReadonlySet<string>;
  canonicalQueryHash: string;
  methodQueryKey: readonly unknown[];
  queryClient: QueryClient;
  transport: Transport;
}) {
  const activeNoncanonicalListFilters = {
    predicate: (query: { queryHash: string }) =>
      query.queryHash !== canonicalQueryHash,
    queryKey: methodQueryKey,
    type: "active" as const,
  };
  const activeDescendantFilters = {
    predicate: (query: { queryHash: string }) =>
      activeDescendantQueryHashes.has(query.queryHash),
    type: "active" as const,
  };

  await Promise.all([
    queryClient.cancelQueries(activeNoncanonicalListFilters, { silent: true }),
    queryClient.cancelQueries(activeDescendantFilters, { silent: true }),
  ]);
  await Promise.all([
    queryClient.refetchQueries(activeNoncanonicalListFilters, {
      throwOnError: true,
    }),
    queryClient.refetchQueries(activeDescendantFilters, {
      throwOnError: true,
    }),
    refreshAllInstancesCache({ queryClient, transport }),
  ]);
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
  const canonicalQueryKey = listAllInstancesQueryOptions({
    transport,
  }).queryKey;
  const canonicalData =
    queryClient.getQueryData<ListInstancesResponse>(canonicalQueryKey);
  let canonicalDataToRestore = canonicalData;
  if (canonicalData && updateInstances) {
    canonicalDataToRestore = create(ListInstancesResponseSchema, {
      instances: updateInstances(canonicalData.instances),
      nextPageToken: canonicalData.nextPageToken,
    });
  }
  const methodQueryKey = createConnectMethodQueryKey({
    method: listInstances,
    transport,
  });
  const canonicalQueryHash = hashKey(canonicalQueryKey);
  const methodQueries = queryClient
    .getQueryCache()
    .findAll({ queryKey: methodQueryKey });
  const methodQueryHashes = new Set(
    methodQueries.map((query) => query.queryHash)
  );
  const descendantQueries = instanceName
    ? queryClient.getQueryCache().findAll({
        predicate: (query) =>
          !methodQueryHashes.has(query.queryHash) &&
          queryKeyIsUnscopedOrUsesTransport(
            query.queryKey,
            methodQueryKey[1].transport
          ) &&
          queryKeyReferencesInstanceResource(query.queryKey, instanceName),
      })
    : [];
  const activeDescendantQueryHashes = new Set<string>();
  const disabledObservedDescendantQueryHashes = new Set<string>();
  for (const query of descendantQueries) {
    if (query.isActive()) {
      activeDescendantQueryHashes.add(query.queryHash);
    } else if (query.getObserversCount() > 0) {
      disabledObservedDescendantQueryHashes.add(query.queryHash);
    }
  }

  queryClient.removeQueries({
    predicate: (query) => query.getObserversCount() === 0,
    queryKey: methodQueryKey,
  });

  if (instanceName) {
    queryClient.removeQueries({
      predicate: (query) =>
        !methodQueryHashes.has(query.queryHash) &&
        query.getObserversCount() === 0 &&
        queryKeyIsUnscopedOrUsesTransport(
          query.queryKey,
          methodQueryKey[1].transport
        ) &&
        queryKeyReferencesInstanceResource(query.queryKey, instanceName),
    });
  }

  if (canonicalDataToRestore) {
    queryClient.setQueryData(canonicalQueryKey, canonicalDataToRestore);
  }

  queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryHash !== canonicalQueryHash &&
      query.getObserversCount() > 0 &&
      !query.isActive(),
    queryKey: methodQueryKey,
    refetchType: "none",
  });
  queryClient.invalidateQueries({
    predicate: (query) =>
      disabledObservedDescendantQueryHashes.has(query.queryHash),
    refetchType: "none",
  });

  refreshInstanceMutationCaches({
    activeDescendantQueryHashes,
    canonicalQueryHash,
    methodQueryKey,
    queryClient,
    transport,
  }).catch((error) => {
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
    queryKey: createConnectListAllQueryKey({
      input,
      method: listInstances,
      transport,
    }),
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
