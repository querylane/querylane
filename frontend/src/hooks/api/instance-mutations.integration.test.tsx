import { create } from "@bufbuild/protobuf";
import { createRouterTransport, type Transport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { createQueryOptions } from "@connectrpc/connect-query-core";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  databasesForInstanceQueryInput,
  listAllDatabasesQueryOptions,
} from "@/hooks/api/database";
import {
  listAllInstancesQueryOptions,
  selectedInstanceQueryOptions,
  useCreateInstanceMutation,
  useDeleteInstanceMutation,
  useUpdateInstanceMutation,
} from "@/hooks/api/instance";
import { ListDatabasesResponseSchema } from "@/protogen/querylane/console/v1alpha1/database_pb";
import {
  CreateInstanceResponseSchema,
  DeleteInstanceResponseSchema,
  GetInstanceOverviewResponseSchema,
  GetInstanceResponseSchema,
  InstanceService,
  type ListInstancesResponse,
  ListInstancesResponseSchema,
  UpdateInstanceResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import { getInstanceOverview } from "@/protogen/querylane/console/v1alpha1/instance-InstanceService_connectquery";
import { createTestQueryClient } from "@/test/query-client";

const INSTANCE_NAME = "instances/local";
const OTHER_INSTANCE_NAME = "instances/staging";
const activeQueryClients: ReturnType<typeof createTestQueryClient>[] = [];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createWrapper(transport: Transport) {
  const queryClient = createTestQueryClient();
  activeQueryClients.push(queryClient);

  return {
    queryClient,
    wrapper({ children }: { children: ReactNode }) {
      return (
        <TransportProvider transport={transport}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </TransportProvider>
      );
    },
  };
}

afterEach(() => {
  cleanup();
  for (const queryClient of activeQueryClients.splice(0)) {
    queryClient.clear();
  }
});

describe("instance mutation cache invalidation", () => {
  test("create refreshes the instance list", async () => {
    const listRequests: string[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(InstanceService, {
        createInstance() {
          return create(CreateInstanceResponseSchema, {
            instance: { name: INSTANCE_NAME },
          });
        },
        listInstances(request) {
          listRequests.push(request.pageToken);
          return create(ListInstancesResponseSchema, {
            instances: [{ name: INSTANCE_NAME }],
          });
        },
      });
    });
    const { queryClient, wrapper } = createWrapper(transport);
    const instanceListQueryKey = listAllInstancesQueryOptions({
      transport,
    }).queryKey;
    queryClient.setQueryData(
      instanceListQueryKey,
      create(ListInstancesResponseSchema)
    );
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () => useCreateInstanceMutation({ onSuccess }),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutateAsync({ instanceId: "local" });
    });

    expect(listRequests).toEqual([""]);
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(
      queryClient
        .getQueryData<ListInstancesResponse>(instanceListQueryKey)
        ?.instances.map((instance) => instance.name)
    ).toEqual([INSTANCE_NAME]);
  });

  test("create does not wait for the instance list refresh", async () => {
    const pendingList = deferred<ListInstancesResponse>();
    const listRequests: string[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(InstanceService, {
        createInstance() {
          return create(CreateInstanceResponseSchema, {
            instance: { name: INSTANCE_NAME },
          });
        },
        listInstances(request) {
          listRequests.push(request.pageToken);
          return pendingList.promise;
        },
      });
    });
    const { wrapper } = createWrapper(transport);
    const { result } = renderHook(() => useCreateInstanceMutation(), {
      wrapper,
    });
    const mutationPromise = result.current.mutateAsync({ instanceId: "local" });

    try {
      await waitFor(() => {
        expect(listRequests).toEqual([""]);
        expect(result.current.isSuccess).toBe(true);
      });
    } finally {
      pendingList.resolve(create(ListInstancesResponseSchema));
      await act(async () => {
        await mutationPromise;
      });
    }
  });

  test("update removes the instance caches and refreshes the instance list", async () => {
    const listRequests: string[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(InstanceService, {
        listInstances(request) {
          listRequests.push(request.pageToken);
          return create(ListInstancesResponseSchema, {
            instances: [{ displayName: "Renamed", name: INSTANCE_NAME }],
          });
        },
        updateInstance(request) {
          expect(request.instance?.name).toBe(INSTANCE_NAME);
          return create(UpdateInstanceResponseSchema, {
            instance: { displayName: "Renamed", name: INSTANCE_NAME },
          });
        },
      });
    });
    const { queryClient, wrapper } = createWrapper(transport);
    const instanceQueryKey = selectedInstanceQueryOptions({
      instanceId: "local",
      transport,
    }).queryKey;
    const instanceListQueryKey = listAllInstancesQueryOptions({
      transport,
    }).queryKey;
    queryClient.setQueryData(
      instanceQueryKey,
      create(GetInstanceResponseSchema, {
        instance: { displayName: "Local", name: INSTANCE_NAME },
      })
    );
    queryClient.setQueryData(
      instanceListQueryKey,
      create(ListInstancesResponseSchema, {
        instances: [{ displayName: "Local", name: INSTANCE_NAME }],
      })
    );
    const { result } = renderHook(() => useUpdateInstanceMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        instance: { displayName: "Renamed", name: INSTANCE_NAME },
      });
    });

    expect(queryClient.getQueryData(instanceQueryKey)).toBeUndefined();
    expect(listRequests).toEqual([""]);
    expect(
      queryClient
        .getQueryData<ListInstancesResponse>(instanceListQueryKey)
        ?.instances.map((instance) => instance.displayName)
    ).toEqual(["Renamed"]);
  });

  test("delete removes the instance caches and refreshes the instance list", async () => {
    const listRequests: string[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(InstanceService, {
        deleteInstance(request) {
          expect(request.name).toBe(INSTANCE_NAME);
          return create(DeleteInstanceResponseSchema);
        },
        listInstances(request) {
          listRequests.push(request.pageToken);
          return create(ListInstancesResponseSchema, {
            instances: [{ name: OTHER_INSTANCE_NAME }],
          });
        },
      });
    });
    const { queryClient, wrapper } = createWrapper(transport);
    const instanceQueryKey = selectedInstanceQueryOptions({
      instanceId: "local",
      transport,
    }).queryKey;
    const overviewQueryKey = createQueryOptions(
      getInstanceOverview,
      { name: INSTANCE_NAME },
      { transport }
    ).queryKey;
    const databasesQueryKey = listAllDatabasesQueryOptions({
      input: databasesForInstanceQueryInput("local"),
      transport,
    }).queryKey;
    const otherInstanceQueryKey = selectedInstanceQueryOptions({
      instanceId: "staging",
      transport,
    }).queryKey;
    const instanceListQueryKey = listAllInstancesQueryOptions({
      transport,
    }).queryKey;

    queryClient.setQueryData(
      instanceQueryKey,
      create(GetInstanceResponseSchema, {
        instance: { name: INSTANCE_NAME },
      })
    );
    queryClient.setQueryData(
      overviewQueryKey,
      create(GetInstanceOverviewResponseSchema)
    );
    queryClient.setQueryData(
      databasesQueryKey,
      create(ListDatabasesResponseSchema)
    );
    queryClient.setQueryData(
      otherInstanceQueryKey,
      create(GetInstanceResponseSchema, {
        instance: { name: OTHER_INSTANCE_NAME },
      })
    );
    queryClient.setQueryData(
      instanceListQueryKey,
      create(ListInstancesResponseSchema, {
        instances: [{ name: INSTANCE_NAME }],
      })
    );

    const { result } = renderHook(() => useDeleteInstanceMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ name: INSTANCE_NAME });
    });

    expect({
      databasesCached:
        queryClient.getQueryData(databasesQueryKey) !== undefined,
      instanceCached: queryClient.getQueryData(instanceQueryKey) !== undefined,
      instanceList:
        queryClient
          .getQueryData<ListInstancesResponse>(instanceListQueryKey)
          ?.instances.map((instance) => instance.name) ?? [],
      listRequests,
      otherInstanceCached:
        queryClient.getQueryData(otherInstanceQueryKey) !== undefined,
      overviewCached: queryClient.getQueryData(overviewQueryKey) !== undefined,
    }).toEqual({
      databasesCached: false,
      instanceCached: false,
      instanceList: [OTHER_INSTANCE_NAME],
      listRequests: [""],
      otherInstanceCached: true,
      overviewCached: false,
    });
  });

  test("delete cancels an older in-flight list request before refreshing", async () => {
    const staleList = deferred<ListInstancesResponse>();
    const listRequests: string[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(InstanceService, {
        deleteInstance() {
          return create(DeleteInstanceResponseSchema);
        },
        listInstances(request) {
          listRequests.push(request.pageToken);
          if (listRequests.length === 1) {
            return staleList.promise;
          }
          return create(ListInstancesResponseSchema, {
            instances: [{ name: OTHER_INSTANCE_NAME }],
          });
        },
      });
    });
    const { queryClient, wrapper } = createWrapper(transport);
    const listOptions = listAllInstancesQueryOptions({ transport });
    const staleFetch = queryClient
      .fetchQuery(listOptions)
      .catch(() => undefined);
    await waitFor(() => {
      expect(listRequests).toHaveLength(1);
    });
    const { result } = renderHook(() => useDeleteInstanceMutation(), {
      wrapper,
    });
    const mutationPromise = result.current.mutateAsync({ name: INSTANCE_NAME });

    try {
      await waitFor(() => {
        expect(listRequests).toHaveLength(2);
      });
    } finally {
      staleList.resolve(
        create(ListInstancesResponseSchema, {
          instances: [{ name: INSTANCE_NAME }],
        })
      );
      await staleFetch;
      await mutationPromise;
    }

    await waitFor(() => {
      expect(
        queryClient
          .getQueryData<ListInstancesResponse>(listOptions.queryKey)
          ?.instances.map((instance) => instance.name)
      ).toEqual([OTHER_INSTANCE_NAME]);
    });
  });

  test("delete keeps a failed list refresh from restoring the deleted instance", async () => {
    const transport = createRouterTransport(({ service }) => {
      service(InstanceService, {
        deleteInstance() {
          return create(DeleteInstanceResponseSchema);
        },
        listInstances() {
          throw new Error("list unavailable");
        },
      });
    });
    const { queryClient, wrapper } = createWrapper(transport);
    const instanceListQueryKey = listAllInstancesQueryOptions({
      transport,
    }).queryKey;
    queryClient.setQueryData(
      instanceListQueryKey,
      create(ListInstancesResponseSchema, {
        instances: [{ name: INSTANCE_NAME }],
      })
    );
    const { result } = renderHook(() => useDeleteInstanceMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ name: INSTANCE_NAME });
    });

    expect(
      queryClient
        .getQueryData<ListInstancesResponse>(instanceListQueryKey)
        ?.instances.map((instance) => instance.name)
    ).toEqual([]);
  });
});
