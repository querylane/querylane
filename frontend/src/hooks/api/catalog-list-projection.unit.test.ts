import { expect, test } from "@rstest/core";
import { databasesForInstanceQueryInput } from "@/hooks/api/database";
import { schemasForDatabaseQueryInput } from "@/hooks/api/schema";
import { tablesForSchemaQueryInput } from "@/hooks/api/table";

test("database lists retain navigation and hidden facet fields without unused timestamps", () => {
  expect(databasesForInstanceQueryInput("prod").readMask?.paths).toEqual([
    "character_set",
    "collation",
    "display_name",
    "is_system_database",
    "name",
    "owner",
  ]);
});
test("schema and table catalogs retain map, summary and list dependencies", () => {
  expect(
    schemasForDatabaseQueryInput({ instanceId: "prod", databaseId: "app" })
      .readMask?.paths
  ).toEqual([
    "display_name",
    "is_system_schema",
    "last_ddl_time",
    "name",
    "owner",
  ]);
  expect(
    tablesForSchemaQueryInput({
      instanceId: "prod",
      databaseId: "app",
      schemaId: "public",
    }).readMask?.paths
  ).toEqual([
    "comment",
    "display_name",
    "is_system_table",
    "last_ddl_time",
    "name",
    "owner",
    "row_count",
    "size_bytes",
    "table_type",
  ]);
});
