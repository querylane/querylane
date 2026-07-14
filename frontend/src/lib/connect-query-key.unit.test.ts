import { createRouterTransport } from "@connectrpc/connect";
import {
  addStaticKeyToTransport,
  createConnectQueryKey,
} from "@connectrpc/connect-query-core";
import { describe, expect, test } from "vitest";
import {
  createConnectListAllQueryKey,
  createConnectMethodQueryKey,
} from "@/lib/connect-query-key";
import { listInstances } from "@/protogen/querylane/console/v1alpha1/instance-InstanceService_connectquery";

const transport = addStaticKeyToTransport(
  createRouterTransport(() => undefined),
  "api"
);

describe("Connect Query key helpers", () => {
  test("extends the method key with a unique list-all suffix", () => {
    const input = { orderBy: "display_name asc", pageSize: 1000 };

    expect(
      createConnectListAllQueryKey({ input, method: listInstances, transport })
    ).toEqual([
      ...createConnectQueryKey({
        cardinality: undefined,
        input,
        schema: listInstances,
        transport,
      }),
      "list-all",
    ]);
  });

  test("creates a method-family key without input or cardinality", () => {
    expect(
      createConnectMethodQueryKey({ method: listInstances, transport })
    ).toEqual([
      "connect-query",
      {
        methodName: "ListInstances",
        serviceName: "querylane.console.v1alpha1.InstanceService",
        transport: "api",
      },
    ]);
  });
});
