import { createRouterTransport } from "@connectrpc/connect";
import { describe, expect, test } from "vitest";
import {
  assertNoUnhandledTableDetailQueries,
  tableDetailQueryOptions,
  tablesForSchemaQueryInput,
} from "@/hooks/api/table";
import { QUERY_STALE_TIME } from "@/lib/query-policy";

const TEST_NUMBER_6 = 6;

const TABLE_NAME =
  "instances/local/databases/postgres/schemas/public/tables/orders";

describe("table query option helpers", () => {
  test("builds canonical table list input for a schema", () => {
    expect(
      tablesForSchemaQueryInput({
        databaseId: "postgres",
        instanceId: "local",
        schemaId: "public",
      })
    ).toEqual({
      orderBy: "name asc",
      pageSize: 100,
      parent: "instances/local/databases/postgres/schemas/public",
    });
  });

  test("includes the filter only when one is provided", () => {
    expect(
      tablesForSchemaQueryInput({
        databaseId: "postgres",
        filter: 'name:"orders"',
        instanceId: "local",
        schemaId: "public",
      })
    ).toEqual({
      filter: 'name:"orders"',
      orderBy: "name asc",
      pageSize: 100,
      parent: "instances/local/databases/postgres/schemas/public",
    });
  });

  test("builds one detail query per table metadata facet", () => {
    const transport = createRouterTransport(() => undefined);

    const options = tableDetailQueryOptions({
      databaseId: "postgres",
      instanceId: "local",
      schemaId: "public",
      tableId: "orders",
      transport,
    });

    expect(options).toHaveLength(TEST_NUMBER_6);
    const serializedKeys = options.map((option) =>
      JSON.stringify(option.queryKey)
    );
    expect(new Set(serializedKeys).size).toBe(TEST_NUMBER_6);
    for (const [index, option] of options.entries()) {
      expect(option.staleTime).toBe(QUERY_STALE_TIME.tableMetadata);
      expect(serializedKeys[index]).toContain(TABLE_NAME);
    }
  });

  test("accepts an empty list of unhandled table detail queries", () => {
    expect(() => assertNoUnhandledTableDetailQueries([])).not.toThrow();
  });
});
