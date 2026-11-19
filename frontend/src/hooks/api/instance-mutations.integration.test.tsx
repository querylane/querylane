import { expect, test } from "@rstest/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http } from "msw";
import { InstanceService } from "@/protogen/querylane/console/v1alpha1/instance_pb";
import {
  rpcJson,
  rpcPath,
  setupRpcServer,
  unaryRpc,
} from "@/test/connect.test-utils";
import { createQueryWrapper } from "@/test/query-providers.test-utils";
import {
  useDeleteInstanceMutation,
  useListAllInstancesQuery,
} from "./instance";

const server = setupRpcServer();
const instanceName = "instances/retired";

test("a failed refresh does not resurrect a deleted instance in a mounted list", async () => {
  const listMethod = InstanceService.method.listInstances;
  const deleteMethod = InstanceService.method.deleteInstance;
  const refresh = Promise.withResolvers<void>();

  server.use(
    unaryRpc(listMethod, () => ({
      instances: [{ displayName: "Retired instance", name: instanceName }],
    })),
    unaryRpc(deleteMethod, () => ({}))
  );

  const { queryClient, wrapper } = createQueryWrapper();
  const { result, unmount } = renderHook(
    () => ({
      deletion: useDeleteInstanceMutation(),
      list: useListAllInstancesQuery(),
    }),
    { wrapper }
  );

  try {
    await waitFor(() => {
      expect(
        result.current.list.data?.instances.map(({ name }) => name)
      ).toEqual([instanceName]);
    });

    server.use(
      http.post(rpcPath(listMethod), () => {
        refresh.resolve();
        return rpcJson(
          { code: "unavailable", message: "Instance catalog unavailable" },
          503
        );
      })
    );

    await act(async () => {
      await result.current.deletion.mutateAsync({ name: instanceName });
    });
    await refresh.promise;
    await waitFor(() => {
      expect(result.current.list.isFetching).toBe(false);
    });
    expect(result.current.list.data?.instances).toEqual([]);
  } finally {
    unmount();
    await queryClient.cancelQueries();
    queryClient.clear();
  }
});
