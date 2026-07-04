import { create } from "@bufbuild/protobuf";
import { createRouterTransport } from "@connectrpc/connect";
import { describe, expect, test } from "vitest";
import {
  extensionsForDatabaseQueryInput,
  listAllExtensionsQueryOptions,
} from "@/hooks/api/extension";
import { QUERY_STALE_TIME } from "@/lib/query-policy";
import {
  ExtensionService,
  type ListExtensionsRequest,
  ListExtensionsResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/extension_pb";
import { createTestQueryClient } from "@/test/query-client";

async function disposeTestQueryClient(
  queryClient: ReturnType<typeof createTestQueryClient>
) {
  queryClient.clear();
  await Promise.resolve();
}

describe("extension query option helpers", () => {
  test("builds canonical extension list input for a database", () => {
    expect(
      extensionsForDatabaseQueryInput({
        databaseId: "postgres",
        instanceId: "local",
      })
    ).toEqual({
      orderBy: "installed desc",
      pageSize: 50,
      parent: "instances/local/databases/postgres",
    });
  });

  test("collects every extension page into a single list response", async () => {
    const requests: ListExtensionsRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(ExtensionService, {
        listExtensions(request) {
          requests.push(request);
          if (request.pageToken === "") {
            return create(ListExtensionsResponseSchema, {
              extensions: [{ displayName: "pg_trgm" }],
              nextPageToken: "page-2",
            });
          }
          return create(ListExtensionsResponseSchema, {
            extensions: [{ displayName: "uuid-ossp" }],
            nextPageToken: "",
          });
        },
      });
    });
    const queryClient = createTestQueryClient();
    const options = listAllExtensionsQueryOptions({
      input: extensionsForDatabaseQueryInput({
        databaseId: "postgres",
        instanceId: "local",
      }),
      transport,
    });

    const response = await queryClient.fetchQuery(options);

    expect(requests).toHaveLength(2);
    expect(requests[0]?.parent).toBe("instances/local/databases/postgres");
    expect(requests[1]?.pageToken).toBe("page-2");
    expect(
      response.extensions.map((extension) => extension.displayName)
    ).toEqual(["pg_trgm", "uuid-ossp"]);
    expect(response.nextPageToken).toBe("");
    expect(options.staleTime).toBe(QUERY_STALE_TIME.extensionList);
    await disposeTestQueryClient(queryClient);
  });
});
