import { create } from "@bufbuild/protobuf";
import {
  Code,
  ConnectError,
  createRouterTransport,
  type Transport,
} from "@connectrpc/connect";
import {
  TransportProvider,
  useQuery as useConnectQuery,
} from "@connectrpc/connect-query";
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
  useGetInstanceQuery,
  useListAllInstancesQuery,
  useUpdateInstanceMutation,
} from "@/hooks/api/instance";
import { logger } from "@/lib/diagnostics";
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
import {
  getInstanceOverview,
  listInstances,
} from "@/protogen/querylane/console/v1alpha1/instance-InstanceService_connectquery";
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

describe("instance create and update cache invalidation", () => {
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

  test("create keeps the canonical list when its response and refresh provide no data", async () => {
    const listRequests: string[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(InstanceService, {
        createInstance() {
          return create(CreateInstanceResponseSchema);
        },
        listInstances(request) {
          listRequests.push(request.pageToken);
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
        instances: [{ name: OTHER_INSTANCE_NAME }],
      })
    );
    const { result } = renderHook(() => useCreateInstanceMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ instanceId: "local" });
    });

    await waitFor(() => {
      expect(listRequests).toEqual([""]);
      expect(
        queryClient
          .getQueryData<ListInstancesResponse>(instanceListQueryKey)
          ?.instances.map((instance) => instance.name)
      ).toEqual([OTHER_INSTANCE_NAME]);
    });
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
});

describe("instance list variant invalidation", () => {
  test("keeps mounted list observers connected and refreshes each once", async () => {
    const canonicalRefresh = deferred<ListInstancesResponse>();
    const alternateRefresh = deferred<ListInstancesResponse>();
    const listRequests: string[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(InstanceService, {
        listInstances(request) {
          listRequests.push(request.orderBy);
          const requestCount = listRequests.filter(
            (orderBy) => orderBy === request.orderBy
          ).length;
          if (requestCount === 1) {
            return create(ListInstancesResponseSchema, {
              instances: [{ displayName: "Local", name: INSTANCE_NAME }],
            });
          }
          return request.orderBy === "display_name asc"
            ? canonicalRefresh.promise
            : alternateRefresh.promise;
        },
        updateInstance() {
          return create(UpdateInstanceResponseSchema, {
            instance: { displayName: "Renamed", name: INSTANCE_NAME },
          });
        },
      });
    });
    const alternateInput = { orderBy: "name asc", pageSize: 25 } as const;
    const { wrapper } = createWrapper(transport);
    const { result } = renderHook(
      () => ({
        alternate: useConnectQuery(listInstances, alternateInput),
        canonical: useListAllInstancesQuery(),
        update: useUpdateInstanceMutation(),
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.alternate.isSuccess).toBe(true);
      expect(result.current.canonical.isSuccess).toBe(true);
    });
    expect(listRequests).toEqual(["name asc", "display_name asc"]);

    try {
      await act(async () => {
        await result.current.update.mutateAsync({
          instance: { displayName: "Renamed", name: INSTANCE_NAME },
        });
      });

      await waitFor(() => {
        expect(
          result.current.canonical.data?.instances.map(
            (instance) => instance.displayName
          )
        ).toEqual(["Renamed"]);
      });
      await waitFor(() => {
        expect(listRequests).toEqual([
          "name asc",
          "display_name asc",
          "name asc",
          "display_name asc",
        ]);
      });
    } finally {
      canonicalRefresh.resolve(
        create(ListInstancesResponseSchema, {
          instances: [{ displayName: "Server renamed", name: INSTANCE_NAME }],
        })
      );
      alternateRefresh.resolve(
        create(ListInstancesResponseSchema, {
          instances: [{ displayName: "Server renamed", name: INSTANCE_NAME }],
        })
      );
    }

    await waitFor(() => {
      expect(
        result.current.canonical.data?.instances.map(
          (instance) => instance.displayName
        )
      ).toEqual(["Server renamed"]);
      expect(
        result.current.alternate.data?.instances.map(
          (instance) => instance.displayName
        )
      ).toEqual(["Server renamed"]);
    });
    expect(listRequests).toEqual([
      "name asc",
      "display_name asc",
      "name asc",
      "display_name asc",
    ]);
  });

  test("supersedes a stale active list request after mutation", async () => {
    const staleRefresh = deferred<ListInstancesResponse>();
    const listRequests: string[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(InstanceService, {
        listInstances(request) {
          listRequests.push(request.orderBy);
          const alternateRequestCount = listRequests.filter(
            (orderBy) => orderBy === "name asc"
          ).length;
          if (request.orderBy === "display_name asc") {
            return create(ListInstancesResponseSchema, {
              instances: [
                { displayName: "Server renamed", name: INSTANCE_NAME },
              ],
            });
          }
          if (alternateRequestCount === 1) {
            return create(ListInstancesResponseSchema, {
              instances: [{ displayName: "Local", name: INSTANCE_NAME }],
            });
          }
          if (alternateRequestCount === 2) {
            return staleRefresh.promise;
          }
          return create(ListInstancesResponseSchema, {
            instances: [{ displayName: "Server renamed", name: INSTANCE_NAME }],
          });
        },
        updateInstance() {
          return create(UpdateInstanceResponseSchema, {
            instance: { displayName: "Renamed", name: INSTANCE_NAME },
          });
        },
      });
    });
    const { wrapper } = createWrapper(transport);
    const { result } = renderHook(
      () => ({
        alternate: useConnectQuery(listInstances, {
          orderBy: "name asc",
          pageSize: 25,
        }),
        update: useUpdateInstanceMutation(),
      }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.alternate.isSuccess).toBe(true));
    const staleRefetch = result.current.alternate.refetch();
    await waitFor(() => {
      expect(listRequests).toEqual(["name asc", "name asc"]);
    });

    try {
      await act(async () => {
        await result.current.update.mutateAsync({
          instance: { displayName: "Renamed", name: INSTANCE_NAME },
        });
      });
      await waitFor(() => {
        expect(listRequests).toEqual([
          "name asc",
          "name asc",
          "name asc",
          "display_name asc",
        ]);
      });
    } finally {
      staleRefresh.resolve(
        create(ListInstancesResponseSchema, {
          instances: [{ displayName: "Stale", name: INSTANCE_NAME }],
        })
      );
      await staleRefetch;
    }

    await waitFor(() => {
      expect(
        result.current.alternate.data?.instances.map(
          (instance) => instance.displayName
        )
      ).toEqual(["Server renamed"]);
    });
  });

  test("supersedes an active initial list request after mutation", async () => {
    const initialList = deferred<ListInstancesResponse>();
    const listRequests: string[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(InstanceService, {
        listInstances(request) {
          listRequests.push(request.orderBy);
          if (request.orderBy === "display_name asc") {
            return create(ListInstancesResponseSchema, {
              instances: [
                { displayName: "Server renamed", name: INSTANCE_NAME },
              ],
            });
          }
          if (
            listRequests.filter((orderBy) => orderBy === "name asc").length ===
            1
          ) {
            return initialList.promise;
          }
          return create(ListInstancesResponseSchema, {
            instances: [{ displayName: "Server renamed", name: INSTANCE_NAME }],
          });
        },
        updateInstance() {
          return create(UpdateInstanceResponseSchema, {
            instance: { displayName: "Renamed", name: INSTANCE_NAME },
          });
        },
      });
    });
    const { wrapper } = createWrapper(transport);
    const alternate = renderHook(
      () =>
        useConnectQuery(listInstances, {
          orderBy: "name asc",
          pageSize: 25,
        }),
      { wrapper }
    );
    const update = renderHook(() => useUpdateInstanceMutation(), { wrapper });

    await waitFor(() => expect(listRequests).toEqual(["name asc"]));

    try {
      await act(async () => {
        await update.result.current.mutateAsync({
          instance: { displayName: "Renamed", name: INSTANCE_NAME },
        });
      });
      await waitFor(() => {
        expect(listRequests).toEqual([
          "name asc",
          "name asc",
          "display_name asc",
        ]);
      });
    } finally {
      initialList.resolve(
        create(ListInstancesResponseSchema, {
          instances: [{ displayName: "Stale", name: INSTANCE_NAME }],
        })
      );
    }

    await waitFor(() => {
      expect(
        alternate.result.current.data?.instances.map(
          (instance) => instance.displayName
        )
      ).toEqual(["Server renamed"]);
    });
  });
});

describe("instance list variant cleanup", () => {
  test("logs a failed active variant refresh while preserving its data", async () => {
    const listRequests: string[] = [];
    const refreshError = new ConnectError(
      "alternate list unavailable",
      Code.Unavailable
    );
    const transport = createRouterTransport(({ service }) => {
      service(InstanceService, {
        listInstances(request) {
          listRequests.push(request.orderBy);
          if (request.orderBy === "display_name asc") {
            return create(ListInstancesResponseSchema, {
              instances: [
                { displayName: "Server renamed", name: INSTANCE_NAME },
              ],
            });
          }
          if (
            listRequests.filter((orderBy) => orderBy === "name asc").length ===
            1
          ) {
            return create(ListInstancesResponseSchema, {
              instances: [{ displayName: "Local", name: INSTANCE_NAME }],
            });
          }
          throw refreshError;
        },
        updateInstance() {
          return create(UpdateInstanceResponseSchema, {
            instance: { displayName: "Renamed", name: INSTANCE_NAME },
          });
        },
      });
    });
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const { wrapper } = createWrapper(transport);
    const { result } = renderHook(
      () => ({
        alternate: useConnectQuery(listInstances, {
          orderBy: "name asc",
          pageSize: 25,
        }),
        update: useUpdateInstanceMutation(),
      }),
      { wrapper }
    );

    try {
      await waitFor(() =>
        expect(result.current.alternate.isSuccess).toBe(true)
      );
      await act(async () => {
        await result.current.update.mutateAsync({
          instance: { displayName: "Renamed", name: INSTANCE_NAME },
        });
      });

      await waitFor(() => {
        expect(warn).toHaveBeenCalledWith(
          "Instance mutation cache refresh failed",
          {
            error: expect.stringContaining("alternate list unavailable"),
            instanceName: INSTANCE_NAME,
          }
        );
      });
      expect(result.current.alternate.error?.message).toContain(
        "alternate list unavailable"
      );
      expect(
        result.current.alternate.data?.instances.map(
          (instance) => instance.displayName
        )
      ).toEqual(["Local"]);
      expect(listRequests).toEqual([
        "name asc",
        "name asc",
        "display_name asc",
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  test("update evicts only current-transport list variants before one canonical refresh", async () => {
    const pendingList = deferred<ListInstancesResponse>();
    const listRequests: string[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(InstanceService, {
        listInstances(request) {
          listRequests.push(request.pageToken);
          return pendingList.promise;
        },
        updateInstance() {
          return create(UpdateInstanceResponseSchema, {
            instance: { displayName: "Renamed", name: INSTANCE_NAME },
          });
        },
      });
    });
    const otherTransport = createRouterTransport(() => undefined);
    const { queryClient, wrapper } = createWrapper(transport);
    const canonicalKey = listAllInstancesQueryOptions({ transport }).queryKey;
    const alternateAggregateKey = listAllInstancesQueryOptions({
      input: { orderBy: "name desc", pageSize: 25 },
      transport,
    }).queryKey;
    const standardListKey = createQueryOptions(
      listInstances,
      { orderBy: "name asc", pageSize: 25 },
      { transport }
    ).queryKey;
    const otherTransportKey = listAllInstancesQueryOptions({
      transport: otherTransport,
    }).queryKey;
    const otherTransportResourceKey = selectedInstanceQueryOptions({
      instanceId: "local",
      transport: otherTransport,
    }).queryKey;
    const unrelatedMethodKey = selectedInstanceQueryOptions({
      instanceId: "staging",
      transport,
    }).queryKey;
    const unscopedDescendantKey = [
      "console",
      "schemas",
      "list-pages",
      { parent: `${INSTANCE_NAME}/databases/postgres` },
    ] as const;
    const initialList = create(ListInstancesResponseSchema, {
      instances: [{ displayName: "Local", name: INSTANCE_NAME }],
    });
    queryClient.setQueryData(canonicalKey, initialList);
    queryClient.setQueryData(alternateAggregateKey, initialList);
    queryClient.setQueryData(standardListKey, initialList);
    queryClient.setQueryData(otherTransportKey, initialList);
    queryClient.setQueryData(
      otherTransportResourceKey,
      create(GetInstanceResponseSchema, {
        instance: { name: INSTANCE_NAME },
      })
    );
    queryClient.setQueryData(
      unrelatedMethodKey,
      create(GetInstanceResponseSchema, {
        instance: { name: OTHER_INSTANCE_NAME },
      })
    );
    queryClient.setQueryData(unscopedDescendantKey, { pages: [] });
    const { result } = renderHook(() => useUpdateInstanceMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        instance: { displayName: "Renamed", name: INSTANCE_NAME },
      });
    });

    try {
      await waitFor(() => {
        expect(listRequests).toEqual([""]);
      });
      expect({
        alternateAggregate:
          queryClient.getQueryData(alternateAggregateKey) !== undefined,
        canonicalDisplayNames:
          queryClient
            .getQueryData<ListInstancesResponse>(canonicalKey)
            ?.instances.map((instance) => instance.displayName) ?? [],
        otherTransport:
          queryClient.getQueryData(otherTransportKey) !== undefined,
        otherTransportResource:
          queryClient.getQueryData(otherTransportResourceKey) !== undefined,
        standardList: queryClient.getQueryData(standardListKey) !== undefined,
        unrelatedMethod:
          queryClient.getQueryData(unrelatedMethodKey) !== undefined,
        unscopedDescendant:
          queryClient.getQueryData(unscopedDescendantKey) !== undefined,
      }).toEqual({
        alternateAggregate: false,
        canonicalDisplayNames: ["Renamed"],
        otherTransport: true,
        otherTransportResource: true,
        standardList: false,
        unrelatedMethod: true,
        unscopedDescendant: false,
      });
    } finally {
      pendingList.resolve(
        create(ListInstancesResponseSchema, {
          instances: [{ displayName: "Server renamed", name: INSTANCE_NAME }],
        })
      );
    }

    await waitFor(() => {
      expect(
        queryClient
          .getQueryData<ListInstancesResponse>(canonicalKey)
          ?.instances.map((instance) => instance.displayName)
      ).toEqual(["Server renamed"]);
    });
    expect(listRequests).toEqual([""]);
  });
});

describe("instance descendant invalidation", () => {
  test("keeps a mounted instance observer connected and refetches it once", async () => {
    const getRequests: string[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(InstanceService, {
        getInstance(request) {
          getRequests.push(request.name);
          return create(GetInstanceResponseSchema, {
            instance: {
              displayName:
                getRequests.length === 1 ? "Local" : "Server renamed",
              name: request.name,
            },
          });
        },
        listInstances() {
          return create(ListInstancesResponseSchema);
        },
        updateInstance() {
          return create(UpdateInstanceResponseSchema, {
            instance: { displayName: "Renamed", name: INSTANCE_NAME },
          });
        },
      });
    });
    const { wrapper } = createWrapper(transport);
    const selected = renderHook(
      () => useGetInstanceQuery({ name: INSTANCE_NAME }),
      { wrapper }
    );
    const update = renderHook(() => useUpdateInstanceMutation(), { wrapper });

    await waitFor(() => {
      expect(selected.result.current.data?.instance?.displayName).toBe("Local");
    });
    expect(getRequests).toEqual([INSTANCE_NAME]);

    await act(async () => {
      await update.result.current.mutateAsync({
        instance: { displayName: "Renamed", name: INSTANCE_NAME },
      });
    });

    await waitFor(() => {
      expect(selected.result.current.data?.instance?.displayName).toBe(
        "Server renamed"
      );
    });
    expect(getRequests).toEqual([INSTANCE_NAME, INSTANCE_NAME]);
  });
});

describe("instance deletion cache invalidation", () => {
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
