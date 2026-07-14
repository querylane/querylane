import { create } from "@bufbuild/protobuf";
import { createRouterTransport } from "@connectrpc/connect";
import { describe, expect, test } from "vitest";
import {
  DEFAULT_ALL_INSTANCES_QUERY_INPUT,
  listAllInstancesQueryOptions,
  refreshAllInstancesCache,
  selectedInstanceQueryOptions,
} from "@/hooks/api/instance";
import { createConnectListAllQueryKey } from "@/lib/connect-query-key";
import { QUERY_STALE_TIME } from "@/lib/query-policy";
import {
  GetInstanceResponseSchema,
  InstanceService,
  type ListInstancesRequest,
  ListInstancesResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import { listInstances } from "@/protogen/querylane/console/v1alpha1/instance-InstanceService_connectquery";
import { createTestQueryClient } from "@/test/query-client";

const TEST_NUMBER_1000 = 1000;
const TEST_NUMBER_4 = 4;

async function disposeTestQueryClient(
  queryClient: ReturnType<typeof createTestQueryClient>
) {
  queryClient.clear();
  await Promise.resolve();
}

function createListInstancesTransport(requests: ListInstancesRequest[]) {
  return createRouterTransport(({ service }) => {
    service(InstanceService, {
      listInstances(request) {
        requests.push(request);
        if (request.pageToken === "") {
          return create(ListInstancesResponseSchema, {
            instances: [{ displayName: "Local", name: "instances/local" }],
            nextPageToken: "page-2",
          });
        }
        return create(ListInstancesResponseSchema, {
          instances: [{ displayName: "Staging", name: "instances/staging" }],
          nextPageToken: "",
        });
      },
    });
  });
}

describe("instance query option helpers", () => {
  test("defaults the instance list input to name-ordered full pages", () => {
    expect(DEFAULT_ALL_INSTANCES_QUERY_INPUT).toEqual({
      orderBy: "display_name asc",
      pageSize: 1000,
    });
  });

  test("uses the Connect Query ListInstances key for the aggregate cache", () => {
    const transport = createRouterTransport(() => undefined);

    expect(listAllInstancesQueryOptions({ transport }).queryKey).toEqual(
      createConnectListAllQueryKey({
        input: DEFAULT_ALL_INSTANCES_QUERY_INPUT,
        method: listInstances,
        transport,
      })
    );
  });

  test("collects every instance page into a single list response", async () => {
    const requests: ListInstancesRequest[] = [];
    const transport = createListInstancesTransport(requests);
    const queryClient = createTestQueryClient();
    const options = listAllInstancesQueryOptions({ transport });

    const response = await queryClient.fetchQuery(options);

    expect(requests).toHaveLength(2);
    expect(requests[0]?.orderBy).toBe("display_name asc");
    expect(requests[0]?.pageSize).toBe(TEST_NUMBER_1000);
    expect(requests[1]?.pageToken).toBe("page-2");
    expect(response.instances.map((instance) => instance.name)).toEqual([
      "instances/local",
      "instances/staging",
    ]);
    expect(response.nextPageToken).toBe("");
    expect(options.staleTime).toBe(QUERY_STALE_TIME.instanceList);
    await disposeTestQueryClient(queryClient);
  });

  test("fetches the selected instance by resource name", async () => {
    const requestedNames: string[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(InstanceService, {
        getInstance(request) {
          requestedNames.push(request.name);
          return create(GetInstanceResponseSchema, {
            instance: { name: request.name },
          });
        },
      });
    });
    const queryClient = createTestQueryClient();
    const options = selectedInstanceQueryOptions({
      instanceId: "local",
      transport,
    });

    const response = await queryClient.fetchQuery(options);

    expect(requestedNames).toEqual(["instances/local"]);
    expect(response.instance?.name).toBe("instances/local");
    expect(options.staleTime).toBe(QUERY_STALE_TIME.instanceDetail);
    await disposeTestQueryClient(queryClient);
  });

  test("refreshAllInstancesCache refetches and primes the list cache", async () => {
    const requests: ListInstancesRequest[] = [];
    const transport = createListInstancesTransport(requests);
    const queryClient = createTestQueryClient();

    const response = await refreshAllInstancesCache({ queryClient, transport });

    expect(requests).toHaveLength(2);
    expect(response.instances).toHaveLength(2);
    expect(
      queryClient.getQueryData(
        listAllInstancesQueryOptions({ transport }).queryKey
      )
    ).toBe(response);

    // A staleTime of zero forces the next refresh to hit the transport again.
    await refreshAllInstancesCache({
      input: DEFAULT_ALL_INSTANCES_QUERY_INPUT,
      queryClient,
      transport,
    });

    expect(requests).toHaveLength(TEST_NUMBER_4);
    await disposeTestQueryClient(queryClient);
  });
});
