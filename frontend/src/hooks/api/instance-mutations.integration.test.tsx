import { create } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import {
  TransportProvider,
  useQuery as useConnectQuery,
} from "@connectrpc/connect-query";
import { createQueryOptions } from "@connectrpc/connect-query-core";
import { afterEach, describe, expect, test } from "@rstest/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  listAllInstancesQueryOptions,
  selectedInstanceQueryOptions,
  useCreateInstanceMutation,
  useDeleteInstanceMutation,
  useListAllInstancesQuery,
  useUpdateInstanceMutation,
} from "@/hooks/api/instance";
import {
  CreateInstanceResponseSchema,
  DeleteInstanceResponseSchema,
  GetInstanceResponseSchema,
  InstanceService,
  type ListInstancesResponse,
  ListInstancesResponseSchema,
  UpdateInstanceResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import { listInstances } from "@/protogen/querylane/console/v1alpha1/instance-InstanceService_connectquery";
import { createTestQueryClient } from "@/test/query-client";
import { createTestRouterTransport } from "@/test/router-transport";

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
  test("create keeps the canonical list when its response and refresh provide no data", async () => {
    const listRequests: string[] = [];
    const transport = createTestRouterTransport(({ service }) => {
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
});

describe("instance list variant invalidation", () => {
  test("keeps mounted list observers connected and refreshes each once", async () => {
    const canonicalRefresh = deferred<ListInstancesResponse>();
    const alternateRefresh = deferred<ListInstancesResponse>();
    const listRequests: string[] = [];
    const transport = createTestRouterTransport(({ service }) => {
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
});

describe("instance list variant cleanup", () => {
  test("update evicts only current-transport list variants before one canonical refresh", async () => {
    const pendingList = deferred<ListInstancesResponse>();
    const listRequests: string[] = [];
    const transport = createTestRouterTransport(({ service }) => {
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
    const otherTransport = createTestRouterTransport(() => undefined);
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

describe("instance deletion cache invalidation", () => {
  test("delete keeps a failed list refresh from restoring the deleted instance", async () => {
    const transport = createTestRouterTransport(({ service }) => {
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
