import { create } from "@bufbuild/protobuf";
import { createRouterTransport, type Transport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test } from "vitest";
import { useReadRowsQuery } from "@/hooks/api/table-data";
import {
  type ReadRowsRequest,
  ReadRowsRequestSchema,
  ReadRowsResponseSchema,
  TableDataService,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { createTestQueryClient } from "@/test/query-client";

const activeQueryClients: QueryClient[] = [];

function createWrapper(transport: Transport, queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <TransportProvider transport={transport}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </TransportProvider>
    );
  };
}

afterEach(async () => {
  cleanup();
  for (const queryClient of activeQueryClients.splice(0)) {
    await queryClient.cancelQueries();
    queryClient.clear();
  }
});

describe("useReadRowsQuery", () => {
  test("refetches stale table rows once when the query remounts", async () => {
    const requests: ReadRowsRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(TableDataService, {
        readRows(request) {
          requests.push(request);
          return create(ReadRowsResponseSchema);
        },
      });
    });
    const queryClient = createTestQueryClient();
    activeQueryClients.push(queryClient);
    const wrapper = createWrapper(transport, queryClient);
    const request = create(ReadRowsRequestSchema, {
      name: "instances/local/databases/postgres/schemas/public/tables/events",
    });

    const firstMount = renderHook(() => useReadRowsQuery(request), { wrapper });

    await waitFor(() => {
      expect(firstMount.result.current.isSuccess).toBe(true);
    });
    expect(requests).toHaveLength(1);

    firstMount.unmount();
    const secondMount = renderHook(() => useReadRowsQuery(request), {
      wrapper,
    });

    await waitFor(() => {
      expect(requests).toHaveLength(2);
      expect(secondMount.result.current.fetchStatus).toBe("idle");
    });
    expect(requests.map(({ name }) => name)).toEqual([
      request.name,
      request.name,
    ]);
  });
});
