import { describe, expect, test } from "vitest";
import {
  type CatalogObjectFacetRow,
  type CatalogSchemaFacetRow,
  filterCatalogObjectsByFacets,
  filterCatalogSchemasByFacets,
  presentCatalogObjectKindOptions,
  presentCatalogObjectSchemaOptions,
  presentCatalogSchemaKindOptions,
  presentCatalogSchemaOwnerOptions,
} from "@/components/console-pages/database-overview-filters";

interface TestCatalogObject extends CatalogObjectFacetRow {
  objectId: string;
}

interface TestCatalogSchema extends CatalogSchemaFacetRow {
  schemaId: string;
}

const objects: TestCatalogObject[] = [
  {
    kind: "table",
    objectId: "orders",
    schemaId: "public",
  },
  {
    kind: "view",
    objectId: "daily_rollup",
    schemaId: "analytics",
  },
  {
    kind: "table",
    objectId: "pg_class",
    schemaId: "pg_catalog",
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
      { label: "Views", value: "view" },
    ]);
    expect(presentCatalogObjectSchemaOptions(objects)).toEqual([
      { label: "analytics", value: "analytics" },
      { label: "pg_catalog", value: "pg_catalog" },
      { label: "public", value: "public" },
    ]);
  });

  test("filters largest objects by kind and schema together", () => {
    expect(
      filterCatalogObjectsByFacets({
        kindFilters: ["view"],
        objects,
        schemaFilters: ["analytics"],
      }).map((object) => object.objectId)
    ).toEqual(["daily_rollup"]);

    expect(
      filterCatalogObjectsByFacets({
        kindFilters: ["table"],
        objects,
        schemaFilters: ["pg_catalog"],
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
