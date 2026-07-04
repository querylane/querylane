import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";
import {
  schemasInMapScope,
  structureMapSchemaInput,
  structureMapTableInput,
  structureMapTruncatedReason,
  structureMapViewInput,
} from "@/features/database-visualization/structure-map-data";
import { ListSchemasResponseSchema } from "@/protogen/querylane/console/v1alpha1/schema_pb";
import { ListTablesResponseSchema } from "@/protogen/querylane/console/v1alpha1/table_pb";

const schemas = [
  { id: "public", name: "public", owner: "app" },
  {
    id: "information_schema",
    name: "information_schema",
    owner: "postgres",
  },
];

describe("structure map data inputs", () => {
  test("keeps the selected system schema in current-schema maps", () => {
    expect(
      schemasInMapScope({
        activeSchemaName: "information_schema",
        detailScope: "selected-schema",
        schemas,
      }).map((schema) => schema.name)
    ).toEqual(["information_schema"]);
  });

  test("does not filter system catalogs out of map requests", () => {
    expect(
      structureMapSchemaInput({
        databaseId: "postgres",
        instanceId: "local-dev",
      })
    ).not.toHaveProperty("filter");
    expect(
      structureMapTableInput({
        databaseId: "postgres",
        instanceId: "local-dev",
        schemaId: "information_schema",
      })
    ).not.toHaveProperty("filter");
    expect(
      structureMapViewInput({
        databaseId: "postgres",
        instanceId: "local-dev",
        schemaId: "information_schema",
      })
    ).not.toHaveProperty("filter");
  });
});

describe("structureMapTruncatedReason", () => {
  test("describes schema pagination without hardcoding a page size", () => {
    const reason = structureMapTruncatedReason({
      detailScope: "all",
      inspectedTableCount: 0,
      schemaResponse: create(ListSchemasResponseSchema, {
        nextPageToken: "next",
        schemas: [],
      }),
      tableResponses: [],
      totalInspectableTables: 0,
      viewResponses: [],
    });

    expect(reason).toBe("More schemas are available.");
    expect(reason).not.toContain("100");
  });

  test("describes table and view pagination without hardcoding a page size", () => {
    const reason = structureMapTruncatedReason({
      detailScope: "selected-schema",
      inspectedTableCount: 0,
      schemaResponse: undefined,
      tableResponses: [
        {
          data: create(ListTablesResponseSchema, {
            nextPageToken: "next",
            tables: [],
          }),
        },
      ],
      totalInspectableTables: 0,
      viewResponses: [],
    });

    expect(reason).toBe("More tables or views are available.");
    expect(reason).not.toContain("100");
  });
});
