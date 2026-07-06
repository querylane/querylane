import { describe, expect, test } from "vitest";
import {
  type CatalogObjectFacetRow,
  type CatalogSchemaFacetRow,
  filterCatalogObjectsByFacets,
  filterCatalogSchemasByFacets,
  presentCatalogObjectKindOptions,
  presentCatalogObjectOwnerOptions,
  presentCatalogObjectSchemaOptions,
  presentCatalogObjectSystemOptions,
  presentCatalogSchemaKindOptions,
  presentCatalogSchemaOwnerOptions,
} from "@/components/console-pages/database-overview-filters";
import { Table_TableType } from "@/protogen/querylane/console/v1alpha1/table_pb";

interface TestCatalogObject extends CatalogObjectFacetRow {
  objectId: string;
}

interface TestCatalogSchema extends CatalogSchemaFacetRow {
  schemaId: string;
}

const objects: TestCatalogObject[] = [
  {
    isMaterialized: false,
    isSystem: false,
    kind: "table",
    objectId: "orders",
    owner: "app_owner",
    schemaId: "public",
    tableType: Table_TableType.BASE_TABLE,
  },
  {
    isMaterialized: true,
    isSystem: false,
    kind: "view",
    objectId: "daily_rollup",
    owner: "analytics_owner",
    schemaId: "analytics",
    tableType: Table_TableType.UNSPECIFIED,
  },
  {
    isMaterialized: false,
    isSystem: false,
    kind: "table",
    objectId: "events_2026",
    owner: "app_owner",
    schemaId: "public",
    tableType: Table_TableType.PARTITIONED,
  },
  {
    isMaterialized: false,
    isSystem: true,
    kind: "view",
    objectId: "pg_views",
    owner: "postgres",
    schemaId: "pg_catalog",
    tableType: Table_TableType.UNSPECIFIED,
  },
  {
    isMaterialized: false,
    isSystem: true,
    kind: "table",
    objectId: "pg_class",
    owner: "postgres",
    schemaId: "pg_catalog",
    tableType: Table_TableType.BASE_TABLE,
  },
];

const schemas: TestCatalogSchema[] = [
  {
    isSystemSchema: false,
    owner: "app_owner",
    schemaId: "public",
  },
  {
    isSystemSchema: false,
    owner: "analytics_owner",
    schemaId: "analytics",
  },
  {
    isSystemSchema: true,
    owner: "postgres",
    schemaId: "pg_catalog",
  },
];

describe("database overview filters", () => {
  test("builds largest-object kind and schema facets", () => {
    expect(presentCatalogObjectKindOptions(objects)).toEqual([
      { label: "Tables", value: "table" },
      { label: "Partitioned tables", value: "partitioned-table" },
      { label: "Views", value: "view" },
      { label: "Materialized views", value: "materialized-view" },
    ]);
    expect(presentCatalogObjectSchemaOptions(objects)).toEqual([
      { label: "analytics", value: "analytics" },
      { label: "pg_catalog", value: "pg_catalog" },
      { label: "public", value: "public" },
    ]);
    expect(presentCatalogObjectSystemOptions(objects)).toEqual([
      { label: "User", value: "user" },
      { label: "System", value: "system" },
    ]);
    expect(
      presentCatalogObjectOwnerOptions(objects).map((option) => option.label)
    ).toEqual(["analytics_owner", "app_owner", "postgres"]);
  });

  test("filters largest objects by kind, system state, schema, and owner together", () => {
    expect(
      filterCatalogObjectsByFacets({
        kindFilters: ["materialized-view"],
        objects,
        ownerFilters: ["analytics_owner"],
        schemaFilters: ["analytics"],
        systemFilters: ["user"],
      }).map((object) => object.objectId)
    ).toEqual(["daily_rollup"]);

    expect(
      filterCatalogObjectsByFacets({
        kindFilters: ["partitioned-table"],
        objects,
        ownerFilters: ["app_owner"],
        schemaFilters: ["public"],
        systemFilters: ["user"],
      }).map((object) => object.objectId)
    ).toEqual(["events_2026"]);

    expect(
      filterCatalogObjectsByFacets({
        kindFilters: ["table"],
        objects,
        ownerFilters: ["postgres"],
        schemaFilters: ["pg_catalog"],
        systemFilters: ["system"],
      }).map((object) => object.objectId)
    ).toEqual(["pg_class"]);
  });

  test("builds schema kind and owner facets", () => {
    expect(presentCatalogSchemaKindOptions(schemas)).toEqual([
      { label: "User", value: "user" },
      { label: "System", value: "system" },
    ]);
    expect(
      presentCatalogSchemaOwnerOptions(schemas).map((option) => option.label)
    ).toEqual(["analytics_owner", "app_owner", "postgres"]);
  });

  test("filters schemas by kind and owner together", () => {
    expect(
      filterCatalogSchemasByFacets({
        kindFilters: ["user"],
        ownerFilters: ["analytics_owner"],
        schemas,
      }).map((schema) => schema.schemaId)
    ).toEqual(["analytics"]);

    expect(
      filterCatalogSchemasByFacets({
        kindFilters: ["system"],
        ownerFilters: ["postgres"],
        schemas,
      }).map((schema) => schema.schemaId)
    ).toEqual(["pg_catalog"]);
  });
});
