import { expect, test } from "@rstest/core";
import { renderHook, waitFor } from "@testing-library/react";
import { SchemaService } from "@/protogen/querylane/console/v1alpha1/schema_pb";
import {
  type ListTablesRequest,
  TableService,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import { ViewService } from "@/protogen/querylane/console/v1alpha1/view_pb";
import { setupRpcServer, unaryRpc } from "@/test/connect.test-utils";
import { createQueryWrapper } from "@/test/query-providers.test-utils";
import { useDatabaseCatalogQuery } from "./database-catalog";

const server = setupRpcServer();
const schemaName = "instances/local/databases/postgres/schemas";

test("catalog sampling bounds requests and qualifies totals when it cannot read every schema", async () => {
  const tableRequests: ListTablesRequest[] = [];

  server.use(
    unaryRpc(SchemaService.method.listSchemas, () => ({
      schemas: Array.from({ length: 10 }, (_, index) => ({
        displayName: `schema_${index}`,
        name: `${schemaName}/schema_${index}`,
      })),
    })),
    unaryRpc(TableService.method.listTables, (request) => {
      tableRequests.push(request);
      return {
        nextPageToken: "more-tables",
        tables: Array.from({ length: request.pageSize }, (_, index) => ({
          displayName: `table_${index}`,
          name: `${request.parent}/tables/table_${index}`,
          rowCount: 12n,
          sizeBytes: 1024n,
        })),
      };
    }),
    unaryRpc(ViewService.method.listViews, () => ({}))
  );

  const { queryClient, wrapper } = createQueryWrapper();
  const { result, unmount } = renderHook(
    () =>
      useDatabaseCatalogQuery({
        databaseId: "postgres",
        instanceId: "local",
      }),
    { wrapper }
  );

  try {
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.objects).toHaveLength(1000);
    expect(result.current.data?.totals).toMatchObject({
      estimatedRows: 12_000,
      schemaCount: 5,
      tableCount: 1000,
      totalSizeBytes: 1_024_000n,
    });
    expect(result.current.data?.coverage).toMatchObject({
      isPartial: true,
      objectsPartial: true,
      schemasPartial: true,
    });
    expect(tableRequests).toHaveLength(5);
    expect(tableRequests.every((request) => request.pageSize === 200)).toBe(
      true
    );
    expect(tableRequests[0]?.readMask?.paths).toEqual(
      expect.arrayContaining(["name", "row_count", "size_bytes"])
    );
  } finally {
    unmount();
    await queryClient.cancelQueries();
    queryClient.clear();
  }
});
