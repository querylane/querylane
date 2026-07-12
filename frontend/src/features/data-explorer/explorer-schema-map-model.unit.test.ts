import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";
import type { SchemaSummary } from "@/features/data-explorer/data-explorer-model";
import {
  buildSchemaMapModel,
  selectSchemaMapMetadataTableNames,
} from "@/features/data-explorer/explorer-schema-map-model";
import {
  ColumnSchema,
  ConstraintType,
  TableConstraintSchema,
  TableSchema,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

const schemas: SchemaSummary[] = [
  { id: "shipping", name: "shipping", owner: "app_owner" },
  { id: "catalog", name: "catalog", owner: "app_owner" },
];

const shipments = create(TableSchema, {
  displayName: "shipments",
  name: "instances/local/databases/logistics/schemas/shipping/tables/shipments",
  rowCount: 2_400_000n,
  sizeBytes: 128n,
});
const carriers = create(TableSchema, {
  displayName: "carriers",
  name: "instances/local/databases/logistics/schemas/shipping/tables/carriers",
  rowCount: 312n,
  sizeBytes: 64n,
});
const ports = create(TableSchema, {
  displayName: "ports",
  name: "instances/local/databases/logistics/schemas/catalog/tables/ports",
  rowCount: 642n,
  sizeBytes: 64n,
});
const tables = [shipments, carriers, ports];

describe("buildSchemaMapModel", () => {
  test("groups tables by schema and derives foreign-key edges", () => {
    const model = buildSchemaMapModel({
      columnsByTable: {
        [shipments.name]: [
          create(ColumnSchema, {
            columnName: "id",
            isPrimaryKey: true,
            rawType: "uuid",
          }),
          create(ColumnSchema, {
            columnName: "carrier_id",
            rawType: "integer",
          }),
        ],
        [carriers.name]: [
          create(ColumnSchema, {
            columnName: "id",
            isPrimaryKey: true,
            rawType: "integer",
          }),
        ],
      },
      constraintsByTable: {
        [shipments.name]: [
          create(TableConstraintSchema, {
            columnNames: ["carrier_id"],
            referencedColumnNames: ["id"],
            referencedTable: carriers.name,
            type: ConstraintType.FOREIGN_KEY,
          }),
        ],
      },
      filter: { query: "", schemaName: "All" },
      schemas,
      tables,
      views: [],
    });

    expect(model.chips).toEqual([
      { count: 3, label: "All", value: "All" },
      { count: 2, label: "shipping", value: "shipping" },
      { count: 1, label: "catalog", value: "catalog" },
    ]);
    expect(model.nodes.map((node) => node.name)).toEqual([
      "carriers",
      "shipments",
      "ports",
    ]);
    expect(model.edges).toHaveLength(1);
    expect(model.edges[0]).toMatchObject({
      fromLabel: "shipments.carrier_id",
      toLabel: "carriers.id",
    });
  });

  test("lays out relationship chains left to right inside schema hulls", () => {
    const shipmentEvent = create(TableSchema, {
      displayName: "shipment_event",
      name: "instances/local/databases/logistics/schemas/shipping/tables/shipment_event",
      rowCount: 18_200_000n,
      sizeBytes: 128n,
    });
    const containers = create(TableSchema, {
      displayName: "containers",
      name: "instances/local/databases/logistics/schemas/shipping/tables/containers",
      rowCount: 88_000n,
      sizeBytes: 128n,
    });
    const model = buildSchemaMapModel({
      columnsByTable: {
        [carriers.name]: [
          create(ColumnSchema, {
            columnName: "id",
            isPrimaryKey: true,
            rawType: "integer",
          }),
        ],
        [containers.name]: [
          create(ColumnSchema, {
            columnName: "shipment_id",
            rawType: "uuid",
          }),
        ],
        [ports.name]: [
          create(ColumnSchema, {
            columnName: "code",
            isPrimaryKey: true,
            rawType: "text",
          }),
        ],
        [shipmentEvent.name]: [
          create(ColumnSchema, {
            columnName: "shipment_id",
            rawType: "uuid",
          }),
        ],
        [shipments.name]: [
          create(ColumnSchema, {
            columnName: "carrier_id",
            rawType: "integer",
          }),
        ],
      },
      constraintsByTable: {
        [containers.name]: [
          create(TableConstraintSchema, {
            columnNames: ["shipment_id"],
            referencedColumnNames: ["id"],
            referencedTable: shipments.name,
            type: ConstraintType.FOREIGN_KEY,
          }),
        ],
        [shipmentEvent.name]: [
          create(TableConstraintSchema, {
            columnNames: ["shipment_id"],
            referencedColumnNames: ["id"],
            referencedTable: shipments.name,
            type: ConstraintType.FOREIGN_KEY,
          }),
        ],
        [shipments.name]: [
          create(TableConstraintSchema, {
            columnNames: ["carrier_id"],
            referencedColumnNames: ["id"],
            referencedTable: carriers.name,
            type: ConstraintType.FOREIGN_KEY,
          }),
        ],
      },
      filter: { query: "", schemaName: "All" },
      schemas,
      tables: [carriers, shipments, shipmentEvent, containers, ports],
      views: [],
    });

    const byName = new Map(model.nodes.map((node) => [node.name, node]));
    const carriersNode = byName.get("carriers");
    const shipmentsNode = byName.get("shipments");
    const shipmentEventNode = byName.get("shipment_event");
    const containersNode = byName.get("containers");
    const portsNode = byName.get("ports");

    expect(carriersNode).toBeDefined();
    expect(shipmentsNode).toBeDefined();
    expect(shipmentEventNode).toBeDefined();
    expect(containersNode).toBeDefined();
    expect(portsNode).toBeDefined();
    expect(shipmentsNode?.x).toBeGreaterThan(carriersNode?.x ?? 0);
    expect(shipmentEventNode?.x).toBeGreaterThan(shipmentsNode?.x ?? 0);
    expect(containersNode?.x).toBe(shipmentEventNode?.x);
    expect(containersNode?.y).toBeGreaterThan(shipmentEventNode?.y ?? 0);
    expect(portsNode?.y).toBeGreaterThan(carriersNode?.y ?? 0);
  });

  test("filters table cards by schema and column search", () => {
    const model = buildSchemaMapModel({
      columnsByTable: {
        [shipments.name]: [
          create(ColumnSchema, {
            columnName: "status",
            rawType: "shipment_status",
          }),
        ],
        [ports.name]: [
          create(ColumnSchema, {
            columnName: "country",
            rawType: "text",
          }),
        ],
      },
      constraintsByTable: {},
      filter: { query: "country", schemaName: "catalog" },
      schemas,
      tables,
      views: [],
    });

    expect(model.nodes.map((node) => node.name)).toEqual(["ports"]);
    expect(model.stats).toBe("1 table · 0 foreign keys");
  });

  test("anchors foreign keys from hidden columns to the truncated footer", () => {
    const columns = Array.from({ length: 9 }, (_, index) =>
      create(ColumnSchema, {
        columnName: index === 8 ? "carrier_id" : `column_${index + 1}`,
        rawType: "integer",
      })
    );
    const model = buildSchemaMapModel({
      columnsByTable: {
        [carriers.name]: [
          create(ColumnSchema, {
            columnName: "id",
            isPrimaryKey: true,
            rawType: "integer",
          }),
        ],
        [shipments.name]: columns,
      },
      constraintsByTable: {
        [shipments.name]: [
          create(TableConstraintSchema, {
            columnNames: ["carrier_id"],
            referencedColumnNames: ["id"],
            referencedTable: carriers.name,
            type: ConstraintType.FOREIGN_KEY,
          }),
        ],
      },
      filter: { query: "", schemaName: "shipping" },
      schemas,
      tables: [carriers, shipments],
      views: [],
    });

    const source = model.nodes.find((node) => node.name === "shipments");
    const edge = model.edges[0];
    expect(source).toBeDefined();
    expect(edge).toBeDefined();

    const moveY = Number(edge?.d.split(" ")[2]);
    expect(moveY).toBeGreaterThan(
      (source?.y ?? 0) + (source?.height ?? 0) - 30
    );
  });

  test("reserves body space when table details have not loaded", () => {
    const model = buildSchemaMapModel({
      columnsByTable: {},
      constraintsByTable: {},
      filter: { query: "", schemaName: "catalog" },
      schemas,
      tables: [ports],
      views: [],
    });

    expect(model.nodes[0]?.columnsLoaded).toBe(false);
    expect(model.nodes[0]?.height).toBeGreaterThan(60);
  });

  test("bounds automatic metadata fetches and keeps search and selection on demand", () => {
    const manyTables = Array.from({ length: 30 }, (_, index) =>
      create(TableSchema, {
        displayName: `table_${index + 1}`,
        name: `instances/local/databases/logistics/schemas/shipping/tables/table_${index + 1}`,
      })
    );
    const selectedTable = manyTables[28]?.name ?? "";

    expect(
      selectSchemaMapMetadataTableNames({
        limit: 24,
        query: "",
        schemaNames: ["shipping"],
        selectedTableName: null,
        tables: manyTables,
      })
    ).toHaveLength(24);
    expect(
      selectSchemaMapMetadataTableNames({
        limit: 24,
        query: "table_29",
        schemaNames: ["shipping"],
        selectedTableName: null,
        tables: manyTables,
      })
    ).toEqual([selectedTable]);
    expect(
      selectSchemaMapMetadataTableNames({
        limit: 24,
        query: "",
        schemaNames: ["shipping"],
        selectedTableName: selectedTable,
        tables: manyTables,
      })
    ).toEqual([
      ...manyTables.slice(0, 24).map((table) => table.name),
      selectedTable,
    ]);
  });
});
