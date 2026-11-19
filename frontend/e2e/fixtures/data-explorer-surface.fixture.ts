import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError, type ServiceImpl } from "@connectrpc/connect";
import type { CatalogSyncMetadataSchema } from "../../src/protogen/querylane/console/v1alpha1/catalog_sync_pb";
import {
  GetSchemaResponseSchema,
  ListSchemasResponseSchema,
  type SchemaService,
} from "../../src/protogen/querylane/console/v1alpha1/schema_pb";
import {
  ExplainQueryResponseSchema,
  type SQLService,
} from "../../src/protogen/querylane/console/v1alpha1/sql_pb";
import {
  PaginationStrategy,
  ReadRowsResponseSchema,
  RowCount_Status,
  type TableDataService,
} from "../../src/protogen/querylane/console/v1alpha1/table_data_pb";
import {
  type ColumnSchema,
  ConstraintType,
  DataType,
  GetTablePartitionMetadataResponseSchema,
  GetTableResponseSchema,
  ListTableColumnsResponseSchema,
  ListTableConstraintsResponseSchema,
  ListTableIndexesResponseSchema,
  ListTablePoliciesResponseSchema,
  ListTablesResponseSchema,
  ListTableTriggersResponseSchema,
  RowIdentity_Source,
  Table_TableType,
  type TableConstraintSchema,
  type TableIndexSchema,
  type TablePartitionMetadataSchema,
  type TablePolicySchema,
  type TableSchema,
  type TableService,
  type TableTriggerSchema,
} from "../../src/protogen/querylane/console/v1alpha1/table_pb";
import {
  GetViewResponseSchema,
  ListViewDependenciesResponseSchema,
  ListViewsResponseSchema,
  View_ViewType,
  type ViewSchema,
  type ViewService,
} from "../../src/protogen/querylane/console/v1alpha1/view_pb";

const EXPLORER_INSTANCE_ID = "production";
const EXPLORER_DATABASE_ID = "appdb";
const DATABASE = `instances/${EXPLORER_INSTANCE_ID}/databases/${EXPLORER_DATABASE_ID}`;

type ColumnInit = MessageInitShape<typeof ColumnSchema>;
type ConstraintInit = MessageInitShape<typeof TableConstraintSchema>;
type IndexInit = MessageInitShape<typeof TableIndexSchema>;
type TableInit = MessageInitShape<typeof TableSchema> & { name: string };
type ViewInit = MessageInitShape<typeof ViewSchema> & { name: string };

interface RelationDetail {
  columns?: ColumnInit[];
  constraints?: ConstraintInit[];
  indexes?: IndexInit[];
  partitionMetadata?: MessageInitShape<typeof TablePartitionMetadataSchema>;
  policies?: MessageInitShape<typeof TablePolicySchema>[];
  triggers?: MessageInitShape<typeof TableTriggerSchema>[];
}

interface TableFixture extends RelationDetail {
  table: TableInit;
}

interface ViewFixture extends RelationDetail {
  view: ViewInit;
}

interface SchemaFixture {
  name: string;
  owner?: string;
  tables: TableFixture[];
  tablesSyncMetadata?: MessageInitShape<typeof CatalogSyncMetadataSchema>;
  views?: ViewFixture[];
}

interface ExplorerSurfaceCatalog {
  explainNotices?: string[];

  failing?: readonly string[];

  requests?: string[];
  schemas: SchemaFixture[];

  truncatedSchemas?: readonly string[];
}

function schemaResource(schemaName: string) {
  return `${DATABASE}/schemas/${schemaName}`;
}

function tableResource(schemaName: string, tableName: string) {
  return `${schemaResource(schemaName)}/tables/${tableName}`;
}

function viewResource(schemaName: string, viewName: string) {
  return `${schemaResource(schemaName)}/views/${viewName}`;
}

function schemaMessage(schema: SchemaFixture) {
  return {
    displayName: schema.name,
    name: schemaResource(schema.name),
    owner: schema.owner ?? "app_owner",
  };
}

function readRowsResponse(columns: ColumnInit[]) {
  return create(ReadRowsResponseSchema, {
    resultSet: {
      columns: columns.map(
        ({ columnName = "", isNullable = true, rawType }) => ({
          columnName,
          dataType: DataType.STRING,
          isNullable,
          rawType: rawType ?? "",
        })
      ),
      observedAt: timestampFromDate(new Date("2024-01-01T23:00:00Z")),
      paginationStrategy: PaginationStrategy.KEYSET,
      rowCount: { status: RowCount_Status.AVAILABLE, value: 2n },
      rowIdentity: {
        columnNames: [columns[0]?.columnName ?? ""],
        source: RowIdentity_Source.PRIMARY_KEY,
      },
      rows: [1, 2].map((row) => ({
        rowKey: `row/${row}`,
        values: columns.map(({ columnName }) => ({
          value: {
            kind: {
              case: "stringValue" as const,
              value: `${columnName ?? ""}_${row}`,
            },
          },
        })),
      })),
    },
  });
}

function explorerSurfaceServices(catalog: ExplorerSurfaceCatalog) {
  const failing = new Set(catalog.failing);
  const truncated = new Set(catalog.truncatedSchemas);
  const schemas = new Map(
    catalog.schemas.map((schema) => [schemaResource(schema.name), schema])
  );
  const tables = new Map<string, TableFixture>();
  const views = new Map<string, ViewFixture>();
  for (const schema of catalog.schemas) {
    for (const fixture of schema.tables) {
      tables.set(fixture.table.name, fixture);
    }
    const viewFixtures = schema.views ?? [];
    for (const fixture of viewFixtures) {
      views.set(fixture.view.name, fixture);
    }
  }
  const detail: (name: string) => RelationDetail = (name) =>
    tables.get(name) ?? views.get(name) ?? {};

  function answer<T>(method: string, resource: string, response: () => T) {
    catalog.requests?.push(`${method}:${resource}`);
    if (failing.has(method) || failing.has(resource)) {
      throw new ConnectError(`${method} failed`, Code.Unavailable);
    }
    return response();
  }
  function found<T>(name: string, value: T | undefined) {
    if (value === undefined) {
      throw new ConnectError(`${name} not found`, Code.NotFound);
    }
    return value;
  }

  const schemaService: Partial<ServiceImpl<typeof SchemaService>> = {
    getSchema: ({ name }) =>
      answer("GetSchema", name, () =>
        create(GetSchemaResponseSchema, {
          schema: schemaMessage(found(name, schemas.get(name))),
        })
      ),
    listSchemas: ({ parent }) =>
      answer("ListSchemas", parent, () =>
        create(ListSchemasResponseSchema, {
          schemas: catalog.schemas.map(schemaMessage),
        })
      ),
  };
  const tableService: Partial<ServiceImpl<typeof TableService>> = {
    getTable: ({ name }) =>
      answer("GetTable", name, () =>
        create(GetTableResponseSchema, {
          table: found(name, tables.get(name)).table,
        })
      ),
    getTablePartitionMetadata: ({ name }) =>
      answer("GetTablePartitionMetadata", name, () =>
        create(GetTablePartitionMetadataResponseSchema, {
          partitionMetadata: detail(name).partitionMetadata ?? {},
        })
      ),
    listTableColumns: ({ parent }) =>
      answer("ListTableColumns", parent, () =>
        create(ListTableColumnsResponseSchema, {
          columns: detail(parent).columns ?? [],
        })
      ),
    listTableConstraints: ({ parent }) =>
      answer("ListTableConstraints", parent, () =>
        create(ListTableConstraintsResponseSchema, {
          constraints: detail(parent).constraints ?? [],
        })
      ),
    listTableIndexes: ({ parent }) =>
      answer("ListTableIndexes", parent, () =>
        create(ListTableIndexesResponseSchema, {
          indexes: detail(parent).indexes ?? [],
        })
      ),
    listTablePolicies: ({ parent }) =>
      answer("ListTablePolicies", parent, () =>
        create(ListTablePoliciesResponseSchema, {
          policies: detail(parent).policies ?? [],
        })
      ),
    listTables: ({ parent }) =>
      answer("ListTables", parent, () => {
        const fixture = schemas.get(parent);
        return create(ListTablesResponseSchema, {
          nextPageToken: fixture && truncated.has(fixture.name) ? "next" : "",
          tables: fixture?.tables.map((row) => row.table) ?? [],
          ...(fixture?.tablesSyncMetadata
            ? { syncMetadata: fixture.tablesSyncMetadata }
            : {}),
        });
      }),
    listTableTriggers: ({ parent }) =>
      answer("ListTableTriggers", parent, () =>
        create(ListTableTriggersResponseSchema, {
          triggers: detail(parent).triggers ?? [],
        })
      ),
  };
  const viewService: Partial<ServiceImpl<typeof ViewService>> = {
    getView: ({ name }) =>
      answer("GetView", name, () =>
        create(GetViewResponseSchema, {
          view: found(name, views.get(name)).view,
        })
      ),
    listViewDependencies: ({ parent }) =>
      answer("ListViewDependencies", parent, () =>
        create(ListViewDependenciesResponseSchema)
      ),
    listViews: ({ parent }) =>
      answer("ListViews", parent, () =>
        create(ListViewsResponseSchema, {
          views: schemas.get(parent)?.views?.map((row) => row.view) ?? [],
        })
      ),
  };
  const sqlService: Partial<ServiceImpl<typeof SQLService>> = {
    explainQuery: ({ parent }) =>
      answer("ExplainQuery", parent, () =>
        create(ExplainQueryResponseSchema, {
          notices: catalog.explainNotices ?? [],
          plan: "Seq Scan",
        })
      ),
  };
  const tableDataService: Partial<ServiceImpl<typeof TableDataService>> = {
    readRows: ({ name }) =>
      answer("ReadRows", name, () =>
        readRowsResponse(detail(name).columns ?? [])
      ),
  };

  return {
    schema: schemaService,
    sql: sqlService,
    table: tableService,
    tableData: tableDataService,
    view: viewService,
  };
}

function table(
  schemaName: string,
  tableName: string,
  fields: MessageInitShape<typeof TableSchema> = {}
) {
  return {
    displayName: tableName,
    name: tableResource(schemaName, tableName),
    owner: "app_owner",
    tableType: Table_TableType.BASE_TABLE,
    ...fields,
  };
}

function view(
  schemaName: string,
  viewName: string,
  fields: MessageInitShape<typeof ViewSchema> = {}
) {
  return {
    displayName: viewName,
    name: viewResource(schemaName, viewName),
    owner: "data_platform",
    viewType: View_ViewType.STANDARD,
    ...fields,
  };
}

function column(
  columnName: string,
  [dataType, rawType]: [DataType, string],
  fields: ColumnInit = {}
) {
  return { columnName, dataType, isNullable: false, rawType, ...fields };
}

function ordered(...columns: ColumnInit[]) {
  return columns.map((row, index) => ({ ordinalPosition: index + 1, ...row }));
}

const lastDdlTime = timestampFromDate(new Date("2026-05-20T16:00:00Z"));

function summaryTable(
  tableName: string,
  sizes: { rowCount: bigint; sizeBytes: bigint }
) {
  return {
    table: table("customer_success_reporting", tableName, {
      owner: "data_platform",
      ...sizes,
    }),
  };
}

const SCHEMA_SUMMARY: SchemaFixture = {
  name: "customer_success_reporting",
  owner: "data_platform",
  tables: [
    summaryTable("fact_customer_activity_rollup_daily_archive_2026", {
      rowCount: 8_400_000n,
      sizeBytes: 1_420_000_000n,
    }),
    summaryTable("customer_accounts", {
      rowCount: 986_420n,
      sizeBytes: 428_000_000n,
    }),
    summaryTable("subscription_events", {
      rowCount: 1_250_000n,
      sizeBytes: 398_000_000n,
    }),
    summaryTable("dim_region", { rowCount: 184n, sizeBytes: 28_672n }),
  ],
  views: [
    {
      view: view("customer_success_reporting", "active_customer_accounts", {
        rowCount: 986_420n,
        sizeBytes: 0n,
      }),
    },
    {
      view: view(
        "customer_success_reporting",
        "customer_success_daily_rollups",
        {
          rowCount: 8_400_000n,
          sizeBytes: 512_000_000n,
          viewType: View_ViewType.MATERIALIZED,
        }
      ),
    },
  ],
};

function mapColumn(name: string, rawType: string, primary = false) {
  return { columnName: name, isPrimaryKey: primary, rawType };
}

function mapTable(
  qualifiedName: `${string}.${string}`,
  {
    references = {},
    rowCount,
  }: { references?: Record<string, string>; rowCount: bigint },
  columns: ColumnInit[]
) {
  const [schemaName = "", tableName = ""] = qualifiedName.split(".");
  return {
    columns,
    constraints: Object.entries(references).map(
      ([columnName, referencedTable]) => ({
        columnNames: [columnName],
        constraintName: `${tableName}_${columnName}_fkey`,
        referencedColumnNames: ["id"],
        referencedTable: tableResource("shipping", referencedTable),
        type: ConstraintType.FOREIGN_KEY,
      })
    ),
    table: table(schemaName, tableName, { rowCount, sizeBytes: 128n }),
  };
}

const SCHEMA_MAP_SCHEMAS: SchemaFixture[] = [
  {
    name: "shipping",
    tables: [
      mapTable("shipping.carriers", { rowCount: 312n }, [
        mapColumn("id", "int4", true),
        mapColumn("code", "text"),
        mapColumn("name", "text"),
        mapColumn("scac", "text"),
        mapColumn("active", "bool"),
        mapColumn("rating", "numeric(3,2)"),
        mapColumn("onboarded_at", "date"),
      ]),
      mapTable(
        "shipping.shipments",
        { references: { carrier_id: "carriers" }, rowCount: 2_400_000n },
        [
          mapColumn("id", "uuid", true),
          mapColumn("ref", "text"),
          mapColumn("carrier_id", "int4"),
          mapColumn("status", "shipment_status"),
          mapColumn("origin_port", "text"),
          mapColumn("dest_port", "text"),
          mapColumn("weight_kg", "numeric(10,2)"),
          mapColumn("eta", "date"),
          mapColumn("created_at", "timestamptz"),
        ]
      ),
      mapTable(
        "shipping.shipment_event",
        { references: { shipment_id: "shipments" }, rowCount: 18_200_000n },
        [
          mapColumn("id", "int8", true),
          mapColumn("shipment_id", "uuid"),
          mapColumn("event", "text"),
          mapColumn("location", "text"),
          mapColumn("recorded_at", "timestamptz"),
        ]
      ),
      mapTable(
        "shipping.containers",
        { references: { shipment_id: "shipments" }, rowCount: 88_000n },
        [
          mapColumn("id", "int4", true),
          mapColumn("shipment_id", "uuid"),
          mapColumn("iso_code", "text"),
          mapColumn("ctype", "text"),
          mapColumn("tare_kg", "numeric"),
        ]
      ),
    ],
  },

  {
    name: "catalog",
    tables: [
      mapTable("catalog.ports", { rowCount: 642n }, [
        mapColumn("id", "int4", true),
        mapColumn("code", "text"),
      ]),
      mapTable("catalog.routes", { rowCount: 1800n }, [
        mapColumn("id", "int4", true),
        mapColumn("origin_port", "text"),
      ]),
    ],
  },
  {
    name: "audit",
    tables: [
      mapTable("audit.change_log", { rowCount: 4_200_000n }, [
        mapColumn("id", "int8", true),
        mapColumn("diff", "jsonb"),
      ]),
    ],
  },
];

const MATERIALIZED_VIEW_SCHEMA: SchemaFixture = {
  name: "public",
  tables: [],
  views: [
    {
      columns: ordered(
        column("account_id", [DataType.UUID, "uuid"]),
        column("health_score", [DataType.FLOAT, "numeric"])
      ),
      indexes: [
        {
          definition:
            "CREATE UNIQUE INDEX customer_success_daily_rollups_account_idx ON public.customer_success_daily_rollups USING btree (account_id)",
          indexName: "customer_success_daily_rollups_account_idx",
          isUnique: true,
          isValid: true,
          keyColumns: ["account_id"],
          keyParts: ["account_id"],
          method: "btree",
          sizeBytes: 67_108_864n,
        },
      ],
      view: view("public", "customer_success_daily_rollups", {
        comment:
          "Precomputed customer success metrics for account health dashboards.",
        isPopulated: true,
        lastDdlTime,
        owner: "analytics_owner",
        rowCount: 8_400_000n,
        sizeBytes: 512_000_000n,
        viewType: View_ViewType.MATERIALIZED,
      }),
    },
  ],
};

export type { ExplorerSurfaceCatalog };
export {
  explorerSurfaceServices,
  MATERIALIZED_VIEW_SCHEMA,
  SCHEMA_MAP_SCHEMAS,
  SCHEMA_SUMMARY,
};
