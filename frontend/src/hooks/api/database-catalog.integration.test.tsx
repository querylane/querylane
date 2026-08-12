import { create } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test } from "vitest";
import { useDatabaseCatalogQuery } from "@/hooks/api/database-catalog";
import {
  type ListSchemasRequest,
  ListSchemasResponseSchema,
  SchemaService,
} from "@/protogen/querylane/console/v1alpha1/schema_pb";
import {
  type ListTablesRequest,
  ListTablesResponseSchema,
  TableService,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  type ListViewsRequest,
  ListViewsResponseSchema,
  ViewService,
} from "@/protogen/querylane/console/v1alpha1/view_pb";
import { createTestQueryClient } from "@/test/query-client";
import { createTestRouterTransport } from "@/test/router-transport";

const activeQueryClients: QueryClient[] = [];

function createWrapper(
  transport: Transport,
  queryClient = createTestQueryClient()
) {
  activeQueryClients.push(queryClient);

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
  await Promise.all(
    activeQueryClients.splice(0).map(async (queryClient) => {
      await queryClient.cancelQueries();
      queryClient.clear();
    })
  );
});

describe("useDatabaseCatalogQuery", () => {
  test("keeps catalog requests bounded and reports server continuation", async () => {
    const schemaRequests: ListSchemasRequest[] = [];
    const tableRequests: ListTablesRequest[] = [];
    const viewRequests: ListViewsRequest[] = [];
    const transport = createTestRouterTransport(({ service }) => {
      service(SchemaService, {
        listSchemas(request) {
          schemaRequests.push(request);
          return create(ListSchemasResponseSchema, {
            schemas: request.pageToken
              ? []
              : [
                  {
                    displayName: "public",
                    name: "instances/local/databases/postgres/schemas/public",
                  },
                ],
          });
        },
      });
      service(TableService, {
        listTables(request) {
          tableRequests.push(request);
          return create(ListTablesResponseSchema, {
            nextPageToken: request.pageToken ? "" : "more-tables",
            tables: request.pageToken
              ? []
              : [
                  {
                    displayName: "events",
                    name: `${request.parent}/tables/events`,
                    rowCount: 12n,
                    sizeBytes: 1024n,
                  },
                ],
          });
        },
      });
      service(ViewService, {
        listViews(request) {
          viewRequests.push(request);
          return create(ListViewsResponseSchema, {
            nextPageToken: request.pageToken ? "" : "more-views",
            views: request.pageToken
              ? []
              : [
                  {
                    displayName: "daily_rollup",
                    name: `${request.parent}/views/daily_rollup`,
                  },
                ],
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useDatabaseCatalogQuery({
          databaseId: "postgres",
          instanceId: "local",
        }),
      { wrapper: createWrapper(transport) }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(schemaRequests).toHaveLength(1);
    expect(tableRequests).toHaveLength(1);
    expect(viewRequests).toHaveLength(1);
    expect(schemaRequests[0]?.pageSize).toBeGreaterThan(0);
    expect(tableRequests[0]?.pageSize).toBeGreaterThan(0);
    expect(viewRequests[0]?.pageSize).toBeGreaterThan(0);
    expect(result.current.data?.coverage).toMatchObject({
      isPartial: true,
      objectsPartial: true,
      schemasPartial: false,
    });
    expect(
      result.current.data?.objects.map((object) => object.objectId)
    ).toEqual(["events", "daily_rollup"]);
    expect(result.current.data?.totals).toMatchObject({
      schemaCount: 1,
      tableCount: 1,
      viewCount: 1,
    });
  });

  test("stops catalog aggregation at the global object cap", async () => {
    const tableRequests: ListTablesRequest[] = [];
    const viewRequests: ListViewsRequest[] = [];
    const transport = createTestRouterTransport(({ service }) => {
      service(SchemaService, {
        listSchemas() {
          return create(ListSchemasResponseSchema, {
            schemas: Array.from({ length: 10 }, (_, index) => ({
              displayName: `schema_${index}`,
              name: `instances/local/databases/postgres/schemas/schema_${index}`,
            })),
          });
        },
      });
      service(TableService, {
        listTables(request) {
          tableRequests.push(request);
          return create(ListTablesResponseSchema, {
            tables: Array.from({ length: request.pageSize }, (_, index) => ({
              displayName: `table_${index}`,
              name: `${request.parent}/tables/table_${index}`,
            })),
          });
        },
      });
      service(ViewService, {
        listViews(request) {
          viewRequests.push(request);
          return create(ListViewsResponseSchema);
        },
      });
    });

    const { result } = renderHook(
      () =>
        useDatabaseCatalogQuery({
          databaseId: "postgres",
          instanceId: "local",
        }),
      { wrapper: createWrapper(transport) }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.objects).toHaveLength(1000);
    expect(result.current.data?.schemas).toHaveLength(5);
    expect(result.current.data?.coverage).toMatchObject({
      isPartial: true,
      objectsPartial: true,
      schemasPartial: true,
    });
    expect(tableRequests).toHaveLength(5);
    expect(viewRequests).toHaveLength(5);
    expect(tableRequests.every((request) => request.pageSize === 200)).toBe(
      true
    );
  });
});
