import { create } from "@bufbuild/protobuf";
import { createRouterTransport } from "@connectrpc/connect";
import { describe, expect, test } from "vitest";
import {
  databasesForInstanceQueryInput,
  listAllDatabasesQueryOptions,
  selectedDatabaseQueryOptions,
} from "@/hooks/api/database";
import { createConnectListAllQueryKey } from "@/lib/connect-query-key";
import { QUERY_STALE_TIME } from "@/lib/query-policy";
import {
  DatabaseService,
  GetDatabaseResponseSchema,
  type ListDatabasesRequest,
  ListDatabasesResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/database_pb";
import { listDatabases } from "@/protogen/querylane/console/v1alpha1/database-DatabaseService_connectquery";
import { createTestQueryClient } from "@/test/query-client";

async function disposeTestQueryClient(
  queryClient: ReturnType<typeof createTestQueryClient>
) {
  queryClient.clear();
  await Promise.resolve();
}

// Locks route-loader and DbProvider database-list cache inputs together.
describe("database query option helpers", () => {
  test("builds canonical database list input for an instance", () => {
    expect(databasesForInstanceQueryInput("local")).toEqual({
      orderBy: "name asc",
      pageSize: 1000,
      parent: "instances/local",
    });
  });

  test("uses the Connect Query ListDatabases key for the aggregate cache", () => {
    const transport = createRouterTransport(() => undefined);
    const input = databasesForInstanceQueryInput("local");

    expect(listAllDatabasesQueryOptions({ input, transport }).queryKey).toEqual(
      createConnectListAllQueryKey({
        input,
        method: listDatabases,
        transport,
      })
    );
  });

  test("collects every database page into a single list response", async () => {
    const requests: ListDatabasesRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(DatabaseService, {
        listDatabases(request) {
          requests.push(request);
          if (request.pageToken === "") {
            return create(ListDatabasesResponseSchema, {
              databases: [{ name: "instances/local/databases/postgres" }],
              nextPageToken: "page-2",
            });
          }
          return create(ListDatabasesResponseSchema, {
            databases: [{ name: "instances/local/databases/reports" }],
            nextPageToken: "",
          });
        },
      });
    });
    const queryClient = createTestQueryClient();
    const options = listAllDatabasesQueryOptions({
      input: databasesForInstanceQueryInput("local"),
      transport,
    });

    const response = await queryClient.fetchQuery(options);

    expect(requests).toHaveLength(2);
    expect(requests[0]?.parent).toBe("instances/local");
    expect(requests[1]?.pageToken).toBe("page-2");
    expect(response.databases.map((database) => database.name)).toEqual([
      "instances/local/databases/postgres",
      "instances/local/databases/reports",
    ]);
    expect(response.nextPageToken).toBe("");
    expect(options.staleTime).toBe(QUERY_STALE_TIME.databaseList);
    await disposeTestQueryClient(queryClient);
  });

  test("defaults the list input to an empty request when omitted", async () => {
    const requests: ListDatabasesRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(DatabaseService, {
        listDatabases(request) {
          requests.push(request);
          return create(ListDatabasesResponseSchema, {
            databases: [],
            nextPageToken: "",
          });
        },
      });
    });
    const queryClient = createTestQueryClient();

    await queryClient.fetchQuery(listAllDatabasesQueryOptions({ transport }));

    expect(requests).toHaveLength(1);
    expect(requests[0]?.parent).toBe("");
    expect(requests[0]?.pageSize).toBe(0);
    await disposeTestQueryClient(queryClient);
  });

  test("fetches the selected database by resource name", async () => {
    const requestedNames: string[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(DatabaseService, {
        getDatabase(request) {
          requestedNames.push(request.name);
          return create(GetDatabaseResponseSchema, {
            database: { name: request.name },
          });
        },
      });
    });
    const queryClient = createTestQueryClient();
    const options = selectedDatabaseQueryOptions({
      databaseId: "postgres",
      instanceId: "local",
      transport,
    });

    const response = await queryClient.fetchQuery(options);

    expect(requestedNames).toEqual(["instances/local/databases/postgres"]);
    expect(response.database?.name).toBe("instances/local/databases/postgres");
    expect(options.staleTime).toBe(QUERY_STALE_TIME.selectedDatabase);
    await disposeTestQueryClient(queryClient);
  });
});
