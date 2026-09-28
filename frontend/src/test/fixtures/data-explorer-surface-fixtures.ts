import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError, type ServiceImpl } from "@connectrpc/connect";
import {
  type CatalogSyncMetadataSchema,
  CatalogSyncStatus,
} from "../../protogen/querylane/console/v1alpha1/catalog_sync_pb";
import {
  GetSchemaResponseSchema,
  ListSchemasResponseSchema,
  type SchemaService,
} from "../../protogen/querylane/console/v1alpha1/schema_pb";
import {
  ExplainQueryResponseSchema,
  type SQLService,
} from "../../protogen/querylane/console/v1alpha1/sql_pb";
import {
  PaginationStrategy,
  ReadRowsResponseSchema,
  RowCount_Status,
  type TableDataService,
} from "../../protogen/querylane/console/v1alpha1/table_data_pb";
import {
  type ColumnSchema,
  ConstraintType,
  DataType,
  GetTablePartitionMetadataResponseSchema,
  GetTableResponseSchema,
  IdentityGeneration,
  ListTableColumnsResponseSchema,
  ListTableConstraintsResponseSchema,
  ListTableIndexesResponseSchema,
  ListTablePoliciesResponseSchema,
  ListTablesResponseSchema,
  ListTableTriggersResponseSchema,
  PolicyCommand,
  PolicyMode,
  ReferentialAction,
  RowIdentity_Source,
  Table_TableType,
  type TableConstraintSchema,
  type TableIndexSchema,
  type TablePartitionMetadataSchema,
  type TablePolicySchema,
  type TableSchema,
  type TableService,
  type TableTriggerSchema,
} from "../../protogen/querylane/console/v1alpha1/table_pb";
import {
  GetViewResponseSchema,
  ListViewDependenciesResponseSchema,
  ListViewsResponseSchema,
  View_ViewType,
  type ViewSchema,
  type ViewService,
} from "../../protogen/querylane/console/v1alpha1/view_pb";

// One catalog of schemas, tables, and views for the data explorer detail
// surfaces. rstest serves it through createTestRouterTransport and Playwright
// through serveService, so both answer catalog and table-detail RPCs by
// `parent` / `name` like the backend would. Relative imports keep this module
// loadable from Playwright specs.

const EXPLORER_INSTANCE_ID = "production";
const EXPLORER_DATABASE_ID = "appdb";
const DATABASE = `instances/${EXPLORER_INSTANCE_ID}/databases/${EXPLORER_DATABASE_ID}`;

type ColumnInit = MessageInitShape<typeof ColumnSchema>;
type ConstraintInit = MessageInitShape<typeof TableConstraintSchema>;
type IndexInit = MessageInitShape<typeof TableIndexSchema>;
type TableInit = MessageInitShape<typeof TableSchema> & { name: string };
type ViewInit = MessageInitShape<typeof ViewSchema> & { name: string };

/** Metadata the table-detail RPCs return for one table or view. */
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
  /** RPC method names or resource names whose requests fail with UNAVAILABLE. */
  failing?: readonly string[];
  /** Receives `${method}:${resource}` for every request served. */
  requests?: string[];
  schemas: SchemaFixture[];
  /** Schema names whose ListTables reports another page. */
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

/** The first-page ReadRows response for any table: two plain text rows. */
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
              value: `${columnName}_${row}`,
            },
          },
        })),
      })),
    },
  });
}

/**
 * Connect service implementations for the explorer detail surfaces. Pass them
 * to `createTestRouterTransport` in rstest or `serveService` in Playwright.
 */
function explorerSurfaceServices(catalog: ExplorerSurfaceCatalog) {
  const failing = new Set(catalog.failing ?? []);
  const truncated = new Set(catalog.truncatedSchemas ?? []);
  const schemas = new Map(
    catalog.schemas.map((schema) => [schemaResource(schema.name), schema])
  );
  const tables = new Map<string, TableFixture>();
  const views = new Map<string, ViewFixture>();
  for (const schema of catalog.schemas) {
    for (const fixture of schema.tables) {
      tables.set(fixture.table.name, fixture);
    }
    for (const fixture of schema.views ?? []) {
      views.set(fixture.view.name, fixture);
    }
  }
  const detail = (name: string): RelationDetail =>
    tables.get(name) ?? views.get(name) ?? {};

  function answer<T>(method: string, resource: string, response: () => T) {
    catalog.requests?.push(`${method}:${resource}`);
    if (failing.has(method) || failing.has(resource)) {
      throw new ConnectError(`${method} failed`, Code.Unavailable);
    }
    return response();
  }
  function found<T>(name: string, value: T | undefined): T {
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

// ---------------------------------------------------------------------------
// Builders

function table(
  schemaName: string,
  tableName: string,
  fields: MessageInitShape<typeof TableSchema> = {}
): TableInit {
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
): ViewInit {
  return {
    displayName: viewName,
    name: viewResource(schemaName, viewName),
    owner: "data_platform",
    viewType: View_ViewType.STANDARD,
    ...fields,
  };
}

/** `types` is the proto `DataType` and the PostgreSQL type name. */
function column(
  columnName: string,
  [dataType, rawType]: [DataType, string],
  fields: ColumnInit = {}
): ColumnInit {
  return { columnName, dataType, isNullable: false, rawType, ...fields };
}

/** Numbers columns in declaration order, like `pg_attribute.attnum`. */
function ordered(...columns: ColumnInit[]): ColumnInit[] {
  return columns.map((row, index) => ({ ordinalPosition: index + 1, ...row }));
}

function primaryKey(constraintName: string, columnName: string) {
  return {
    columnNames: [columnName],
    constraintName,
    definition: `PRIMARY KEY (${columnName})`,
    type: ConstraintType.PRIMARY_KEY,
  };
}

const lastDdlTime = timestampFromDate(new Date("2026-05-20T16:00:00Z"));
const MIB = 1_048_576n;

// ---------------------------------------------------------------------------
// Schema overview

function summaryTable(
  tableName: string,
  sizes: { rowCount: bigint; sizeBytes: bigint }
): TableFixture {
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

const SALES_SCHEMA: SchemaFixture = {
  name: "sales",
  owner: "data_platform",
  tables: [
    {
      table: table("sales", "orders", {
        owner: "data_platform",
        rowCount: 120_000n,
        sizeBytes: 80_000_000n,
      }),
    },
  ],
  views: [
    {
      view: view("sales", "daily_rollups", {
        owner: "analytics_owner",
        rowCount: 4200n,
        sizeBytes: 4_096_000n,
        viewType: View_ViewType.MATERIALIZED,
      }),
    },
  ],
};

const STALE_CATALOG_SCHEMA: SchemaFixture = {
  name: "public",
  owner: "data_platform",
  tables: [
    {
      table: table("public", "customers", {
        owner: "data_platform",
        rowCount: 986_420n,
        sizeBytes: 428_000_000n,
      }),
    },
  ],
  tablesSyncMetadata: { isStale: true, syncStatus: CatalogSyncStatus.ERROR },
};

// ---------------------------------------------------------------------------
// Schema map: three schemas linked by foreign keys.

function mapColumn(name: string, rawType: string, primary = false) {
  return { columnName: name, isPrimaryKey: primary, rawType };
}

/** `references` maps a foreign-key column to the `shipping` table it targets. */
function mapTable(
  qualifiedName: `${string}.${string}`,
  {
    references = {},
    rowCount,
  }: { references?: Record<string, string>; rowCount: bigint },
  columns: ColumnInit[]
): TableFixture {
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
  // The explorer scopes the map to the active schema; these schemas prove the
  // other schemas stay out of it.
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

// ---------------------------------------------------------------------------
// Views

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

const STANDARD_VIEW_SCHEMA: SchemaFixture = {
  name: "public",
  tables: [],
  views: [
    {
      view: view("public", "daily_paid_revenue", {
        comment: "Tracks paid revenue by day for finance reporting.",
        definition:
          "SELECT date_trunc('day', paid_at) AS paid_day, sum(amount_cents) AS revenue_cents FROM sales.orders WHERE status = 'paid' GROUP BY 1;",
        lastDdlTime,
        owner: "analytics_owner",
      }),
    },
  ],
};

const VIEW_NOTICES = [
  "NOTICE 00000: planner checked daily_paid_revenue",
  "DETAIL: scan uses the sales.orders source relation",
  "HINT: Refresh the view if estimates look stale",
];

// ---------------------------------------------------------------------------
// public.customers: the shared table-detail fixture.

const CUSTOMERS_COLUMNS = ordered(
  column("customer_id", [DataType.UUID, "uuid"], { isPrimaryKey: true }),
  column("status", [DataType.STRING, "text"], {
    defaultValue: "'active'::text",
  }),
  column("account_id", [DataType.UUID, "uuid"]),
  column("metadata", [DataType.JSON, "jsonb"], {
    defaultValue: "'{}'::jsonb",
    isNullable: true,
  })
);

const ACCOUNT_ID_REFERENCE = {
  columnNames: ["account_id"],
  constraintName: "customers_account_id_fkey",
  referencedColumnNames: ["id"],
  referencedTable: tableResource("public", "accounts"),
  type: ConstraintType.FOREIGN_KEY,
};

function customersSchema(overrides: RelationDetail = {}): SchemaFixture {
  return {
    name: "public",
    tables: [
      {
        columns: CUSTOMERS_COLUMNS,
        constraints: [
          primaryKey("customers_pkey", "customer_id"),
          {
            ...ACCOUNT_ID_REFERENCE,
            definition: "FOREIGN KEY (account_id) REFERENCES accounts(id)",
          },
        ],
        indexes: [
          {
            blocksHit: 989n,
            blocksRead: 11n,
            definition:
              "CREATE INDEX customers_status_account_idx ON public.customers USING btree (status, account_id) INCLUDE (last_seen_at)",
            hasUsageStats: true,
            includedColumns: ["last_seen_at"],
            indexName: "customers_status_account_idx",
            isValid: true,
            keyColumns: ["status", "account_id"],
            keyParts: ["status", "account_id"],
            method: "btree",
            scanCount: 10n,
            sizeBytes: 327_680n,
            tuplesFetched: 8n,
            tuplesRead: 12n,
          },
          {
            blocksHit: 100n,
            definition:
              "CREATE UNIQUE INDEX customers_pkey ON public.customers USING btree (customer_id)",
            hasUsageStats: true,
            indexName: "customers_pkey",
            isUnique: true,
            isValid: true,
            keyColumns: ["customer_id"],
            keyParts: ["customer_id"],
            method: "btree",
            scanCount: 20n,
            sizeBytes: 98_304n,
            tuplesFetched: 18n,
            tuplesRead: 20n,
          },
        ],
        policies: [
          {
            checkExpression:
              "account_id = current_setting('app.account_id')::uuid",
            command: PolicyCommand.SELECT,
            mode: PolicyMode.PERMISSIVE,
            policyName: "customers_account_read_policy",
            roles: ["app_reader", "support_agent"],
            usingExpression:
              "account_id = current_setting('app.account_id')::uuid",
          },
        ],
        table: table("public", "customers", {
          rowCount: 987_654n,
          sizeBytes: 42_467_328n,
        }),
        triggers: [
          {
            definition: "EXECUTE FUNCTION audit_customer_changes()",
            enabled: true,
            events: ["INSERT", "UPDATE"],
            functionName: "audit_customer_changes",
            timing: "AFTER",
            triggerName: "customers_audit_trigger",
          },
        ],
        ...overrides,
      },
    ],
  };
}

const CUSTOMERS_CONSTRAINT_STATES: ConstraintInit[] = [
  {
    ...ACCOUNT_ID_REFERENCE,
    definition:
      "FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON UPDATE SET NULL ON DELETE RESTRICT",
    onDelete: ReferentialAction.RESTRICT,
    onUpdate: ReferentialAction.SET_NULL,
  },
  {
    columnNames: ["status"],
    constraintName: "customers_status_check",
    definition: "CHECK (status IN ('active', 'archived'))",
    type: ConstraintType.CHECK,
  },
  {
    columnNames: ["legacy_status"],
    constraintName: "customers_legacy_status_check",
    definition: "CHECK (legacy_status <> 'deleted') NOT VALID",
    type: ConstraintType.CHECK,
  },
  {
    columnNames: ["active_period"],
    constraintName: "customers_active_period_excl",
    definition: "EXCLUDE USING gist (active_period WITH &&)",
    type: ConstraintType.EXCLUSION,
  },
];

// ---------------------------------------------------------------------------
// billing.invoices: row-level security composition.

const INVOICES_SCHEMA: SchemaFixture = {
  name: "billing",
  tables: [
    {
      columns: CUSTOMERS_COLUMNS,
      policies: [
        {
          checkExpression: "customer = current_setting('app.tenant')",
          command: PolicyCommand.ALL,
          mode: PolicyMode.PERMISSIVE,
          policyName: "invoices_tenant_all",
          roles: ["app_readwrite"],
          usingExpression: "customer = current_setting('app.tenant')",
        },
        {
          command: PolicyCommand.SELECT,
          mode: PolicyMode.PERMISSIVE,
          policyName: "invoices_finance_select",
          roles: ["app_readwrite"],
          usingExpression: "pg_has_role(current_user, 'billing', 'member')",
        },
        {
          command: PolicyCommand.SELECT,
          mode: PolicyMode.PERMISSIVE,
          policyName: "invoices_reader_recent",
          roles: ["app_readonly"],
          usingExpression: "issued_at >= now() - interval '90 days'",
        },
      ],
      table: table("billing", "invoices", {
        rowCount: 940_000n,
        sizeBytes: 2_100_000_000n,
      }),
    },
  ],
};

// ---------------------------------------------------------------------------
// shipping.shipments: column inventory and index usage.

function plainIndex(
  indexName: string,
  keyColumn: string,
  fields: IndexInit
): IndexInit {
  return { indexName, keyColumns: [keyColumn], method: "btree", ...fields };
}

const SHIPMENTS_COLUMNS_SCHEMA: SchemaFixture = {
  name: "shipping",
  tables: [
    {
      columns: ordered(
        column("id", [DataType.UUID, "uuid"], {
          comment: "Surrogate key",
          defaultValue: "gen_random_uuid()",
          isPrimaryKey: true,
        }),
        column("ref", [DataType.STRING, "text"], {
          comment: "Human-readable booking reference",
          isUnique: true,
        }),
        column("carrier_id", [DataType.INTEGER, "int4"]),
        column("status", [DataType.STRING, "shipment_status"]),
        column("origin_port", [DataType.STRING, "text"]),
        column("dest_port", [DataType.STRING, "text"]),
        column("route_code", [DataType.STRING, "text"], {
          generationExpression: "origin_port || ':' || dest_port",
          isGenerated: true,
        }),
        column("sequence_no", [DataType.INTEGER, "int8"], {
          identityGeneration: IdentityGeneration.BY_DEFAULT,
          isIdentity: true,
        }),
        column("weight_kg", [DataType.FLOAT, "numeric(10,2)"]),
        column("eta", [DataType.DATE, "date"], {
          comment: "Set NULL once delivered",
          isNullable: true,
        }),
        column("created_at", [DataType.TIMESTAMP, "timestamptz"], {
          defaultValue: "now()",
        })
      ),
      constraints: [
        primaryKey("shipments_pkey", "id"),
        {
          columnNames: ["ref"],
          constraintName: "shipments_ref_key",
          definition: "UNIQUE (ref)",
          type: ConstraintType.UNIQUE,
        },
        {
          columnNames: ["carrier_id"],
          constraintName: "shipments_carrier_id_fkey",
          definition:
            "FOREIGN KEY (carrier_id) REFERENCES shipping.carriers(id)",
          referencedColumnNames: ["id"],
          referencedTable: tableResource("shipping", "carriers"),
          type: ConstraintType.FOREIGN_KEY,
        },
      ],
      indexes: [
        plainIndex("shipments_pkey", "id", {
          isUnique: true,
          sizeBytes: 327_155_712n,
        }),
        plainIndex("shipments_ref_key", "ref", {
          isUnique: true,
          sizeBytes: 104_857_600n,
        }),
        plainIndex("shipments_status_idx", "status", {
          sizeBytes: 18_874_368n,
        }),
        plainIndex("shipments_carrier_id_idx", "carrier_id", {
          sizeBytes: 54_525_952n,
        }),
      ],
      table: table("shipping", "shipments", {
        rowCount: 2_400_000n,
        sizeBytes: 12_800_000_000n,
      }),
    },
  ],
};

// One more row than the default page size of 10, so pagination kicks in.
const DENSE_LIST_LENGTH = 11;
const DENSE_TRIGGER_COUNT = 12;

const SHIPMENTS_USAGE_INDEXES: IndexInit[] = [
  {
    blocksHit: 997n,
    blocksRead: 3n,
    definition:
      "CREATE UNIQUE INDEX shipments_pkey ON shipping.shipments USING btree (id)",
    hasUsageStats: true,
    indexName: "shipments_pkey",
    isUnique: true,
    isValid: true,
    keyColumns: ["id"],
    keyParts: ["id"],
    method: "btree",
    scanCount: 48_100_000n,
    sizeBytes: 327_155_712n,
    tuplesFetched: 48_100_000n,
    tuplesRead: 48_400_000n,
  },
  {
    blocksHit: 989n,
    blocksRead: 11n,
    definition:
      "CREATE INDEX shipments_status_idx ON shipping.shipments USING btree (status) WHERE status <> 'delivered'",
    hasUsageStats: true,
    indexName: "shipments_status_idx",
    isValid: true,
    keyColumns: ["status"],
    keyParts: ["status"],
    method: "btree",
    predicate: "status <> 'delivered'",
    scanCount: 9_400_000n,
    sizeBytes: 18_874_368n,
    tuplesFetched: 9_300_000n,
    tuplesRead: 11_200_000n,
  },
  {
    blocksHit: 991n,
    blocksRead: 9n,
    definition:
      "CREATE INDEX shipments_carrier_id_idx ON shipping.shipments USING btree (carrier_id)",
    hasUsageStats: true,
    indexName: "shipments_carrier_id_idx",
    isValid: true,
    keyColumns: ["carrier_id"],
    keyParts: ["carrier_id"],
    method: "btree",
    scanCount: 1_200_000n,
    sizeBytes: 54_525_952n,
    tuplesFetched: 1_200_000n,
    tuplesRead: 2_800_000n,
  },
  {
    definition:
      "CREATE INDEX shipments_legacy_ref_idx ON shipping.shipments USING btree (lower(ref))",
    hasExpression: true,
    hasUsageStats: true,
    indexName: "shipments_legacy_ref_idx",
    isValid: true,
    keyParts: ["lower(ref)"],
    method: "btree",
    sizeBytes: 100_663_296n,
  },
];

function shipmentIndexesSchema(indexes: IndexInit[]): SchemaFixture {
  return {
    name: "shipping",
    tables: [
      {
        columns: ordered(
          column("id", [DataType.UUID, "uuid"], { isPrimaryKey: true }),
          column("ref", [DataType.STRING, "text"]),
          column("carrier_id", [DataType.INTEGER, "integer"]),
          column("status", [DataType.STRING, "shipment_status"]),
          column("origin_port", [DataType.STRING, "text"]),
          column("dest_port", [DataType.STRING, "text"]),
          column("weight_kg", [DataType.FLOAT, "numeric"]),
          column("eta", [DataType.DATE, "date"], { isNullable: true }),
          column("created_at", [DataType.TIMESTAMP, "timestamp with time zone"])
        ),
        indexes,
        table: table("shipping", "shipments", {
          rowCount: 2_400_000n,
          sizeBytes: 13_743_895_347n,
        }),
      },
    ],
  };
}

const SHIPMENTS_PAGINATED_INDEXES: IndexInit[] = Array.from(
  { length: DENSE_LIST_LENGTH },
  (_, index) => ({
    indexName: `shipments_route_${index + 1}_idx`,
    isValid: true,
    keyColumns: ["route_id"],
    keyParts: ["route_id"],
    method: index === DENSE_LIST_LENGTH - 1 ? "gin" : "btree",
    sizeBytes: BigInt(index + 1) * MIB,
  })
);

// ---------------------------------------------------------------------------
// shipping.shipment_event: constraints and triggers.

function shipmentEventSchema(overrides: RelationDetail): SchemaFixture {
  return {
    name: "shipping",
    tables: [
      {
        columns: ordered(
          column("id", [DataType.INTEGER, "int8"], { isPrimaryKey: true }),
          column("shipment_id", [DataType.UUID, "uuid"]),
          column("event", [DataType.STRING, "text"]),
          column("recorded_at", [DataType.TIMESTAMP, "timestamptz"])
        ),
        table: table("shipping", "shipment_event", {
          rowCount: 18_200_000n,
          sizeBytes: 21_400_000_000n,
        }),
        ...overrides,
      },
    ],
  };
}

const SHIPMENT_EVENT_CONSTRAINTS: ConstraintInit[] = [
  primaryKey("shipment_event_pkey", "id"),
  {
    columnNames: ["shipment_id"],
    constraintName: "shipment_event_shipment_id_fkey",
    definition:
      "FOREIGN KEY (shipment_id) REFERENCES shipping.shipments(id) ON DELETE CASCADE",
    onDelete: ReferentialAction.CASCADE,
    referencedColumnNames: ["id"],
    referencedTable: tableResource("shipping", "shipments"),
    type: ConstraintType.FOREIGN_KEY,
  },
];

const SHIPMENT_EVENT_PAGINATED_CONSTRAINTS: ConstraintInit[] = Array.from(
  { length: DENSE_LIST_LENGTH },
  (_, index) => ({
    columnNames: [`status_${index + 1}`],
    constraintName: `shipment_event_status_${index + 1}_check`,
    definition: `CHECK (status_${index + 1} <> '')`,
    type: ConstraintType.CHECK,
  })
);

const SHIPMENT_EVENT_TRIGGERS = [
  {
    definition:
      "CREATE TRIGGER trg_event_enrich BEFORE INSERT ON shipping.shipment_event\n  FOR EACH ROW EXECUTE FUNCTION shipping.enrich_event_location();",
    enabled: true,
    events: ["INSERT"],
    functionName: "shipping.enrich_event_location",
    timing: "BEFORE",
    triggerName: "trg_event_enrich",
  },
  {
    definition:
      "CREATE TRIGGER trg_shipments_notify AFTER UPDATE OF status ON shipping.shipment_event FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION shipping.notify_status_change()",
    enabled: false,
    events: ["UPDATE"],
    functionName: "notify_status_change",
    timing: "AFTER",
    triggerName: "trg_shipments_notify",
  },
  {
    definition:
      "CREATE TRIGGER trg_event_statement_log AFTER INSERT OR DELETE OR UPDATE ON shipping.shipment_event FOR EACH STATEMENT EXECUTE FUNCTION shipping.log_shipment_event_summary()",
    enabled: true,
    events: ["INSERT", "DELETE", "UPDATE"],
    functionName: "log_shipment_event_summary",
    timing: "AFTER",
    triggerName: "trg_event_statement_log",
  },
];

const SHIPMENT_EVENT_BULK_TRIGGERS = Array.from(
  { length: DENSE_TRIGGER_COUNT },
  (_, index) => {
    const suffix = String(index).padStart(2, "0");
    return {
      definition: `CREATE TRIGGER trg_bulk_${suffix} AFTER UPDATE ON shipping.shipment_event FOR EACH ROW EXECUTE FUNCTION shipping.handle_bulk_${suffix}()`,
      enabled: true,
      events: ["UPDATE"],
      functionName: `shipping.handle_bulk_${suffix}`,
      timing: "AFTER",
      triggerName: `trg_bulk_${suffix}`,
    };
  }
);

// ---------------------------------------------------------------------------
// audit.change_log: definition and partitions.

const CHANGE_LOG_COLUMNS = ordered(
  column("id", [DataType.INTEGER, "int8"], {
    identityGeneration: IdentityGeneration.BY_DEFAULT,
    isIdentity: true,
  }),
  column("table_name", [DataType.STRING, "text"]),
  column("op", [DataType.STRING, "text"]),
  column("actor", [DataType.STRING, "text"]),
  column("diff", [DataType.JSON, "jsonb"]),
  column("recorded_at", [DataType.TIMESTAMP, "timestamptz"], {
    defaultValue: "now()",
  })
);

const CHANGE_LOG_PKEY_INDEX = {
  indexName: "change_log_pkey",
  isUnique: true,
  keyColumns: ["id"],
  method: "btree",
};

const CHANGE_LOG_DEFINITION_SCHEMA: SchemaFixture = {
  name: "audit",
  tables: [
    {
      columns: CHANGE_LOG_COLUMNS,
      constraints: [primaryKey("change_log_pkey", "id")],
      indexes: [{ ...CHANGE_LOG_PKEY_INDEX, sizeBytes: 98_304n }],
      policies: [
        {
          command: PolicyCommand.SELECT,
          mode: PolicyMode.PERMISSIVE,
          policyName: "change_log_actor_read_policy",
          roles: ["audit_reader"],
          usingExpression: "actor = current_user",
        },
      ],
      table: table("audit", "change_log", {
        rowCount: 4_200_000n,
        sizeBytes: 4_187_000_000n,
      }),
      triggers: [
        {
          // Full pg_get_triggerdef form, matching what the backend returns.
          definition:
            "CREATE TRIGGER change_log_record_trigger\n  AFTER INSERT OR UPDATE OR DELETE ON audit.change_log\n  FOR EACH ROW EXECUTE FUNCTION audit.record_change()",
          enabled: true,
          events: ["INSERT", "UPDATE", "DELETE"],
          functionName: "audit.record_change",
          timing: "AFTER",
          triggerName: "change_log_record_trigger",
        },
      ],
    },
  ],
};

function changeLogPartition(
  suffix: string,
  fields: { estimatedRows: bigint; partitionBound: string; sizeBytes: bigint }
) {
  return {
    displayName: `change_log_${suffix}`,
    table: tableResource("audit", `change_log_${suffix}`),
    ...fields,
  };
}

function changeLogPartitionsSchema(
  childPartitions = [
    changeLogPartition("2026_q1", {
      estimatedRows: 1_020_000n,
      partitionBound: "FOR VALUES FROM ('2026-01-01') TO ('2026-04-01')",
      sizeBytes: 1_006_632_960n,
    }),
    changeLogPartition("2026_q2", {
      estimatedRows: 1_180_000n,
      partitionBound: "FOR VALUES FROM ('2026-04-01') TO ('2026-07-01')",
      sizeBytes: 1_181_116_006n,
    }),
    changeLogPartition("2026_q3", {
      estimatedRows: 48_000n,
      partitionBound: "FOR VALUES FROM ('2026-07-01') TO ('2026-10-01')",
      sizeBytes: 46_137_344n,
    }),
    changeLogPartition("archive", {
      estimatedRows: 1_940_000n,
      partitionBound: "DEFAULT",
      sizeBytes: 1_932_735_283n,
    }),
  ]
): SchemaFixture {
  return {
    name: "audit",
    tables: [
      {
        columns: ordered(
          column("id", [DataType.INTEGER, "int8"], { isPrimaryKey: true }),
          ...CHANGE_LOG_COLUMNS.slice(1)
        ),
        constraints: [primaryKey("change_log_pkey", "id")],
        indexes: [{ ...CHANGE_LOG_PKEY_INDEX, sizeBytes: 67_108_864n }],
        partitionMetadata: {
          childPartitions,
          partitionCount: childPartitions.length,
          partitionKey: "RANGE (recorded_at)",
        },
        table: table("audit", "change_log", {
          rowCount: 4_200_000n,
          sizeBytes: 4_187_590_000n,
        }),
      },
    ],
  };
}

const CHILD_PARTITION_SCHEMA: SchemaFixture = {
  name: "analytics",
  tables: [
    {
      columns: CUSTOMERS_COLUMNS,
      partitionMetadata: {
        parentTable: tableResource("analytics", "events"),
        partitionBound: "FOR VALUES FROM ('2024-01-01') TO ('2025-01-01')",
      },
      table: table("analytics", "events_2024", {
        rowCount: 1_200_000n,
        sizeBytes: 805_306_368n,
      }),
    },
  ],
};

export type {
  ExplorerSurfaceCatalog,
  RelationDetail,
  SchemaFixture,
  TableFixture,
};
export {
  CHANGE_LOG_DEFINITION_SCHEMA,
  CHILD_PARTITION_SCHEMA,
  CUSTOMERS_CONSTRAINT_STATES,
  changeLogPartition,
  changeLogPartitionsSchema,
  column,
  customersSchema,
  EXPLORER_DATABASE_ID,
  EXPLORER_INSTANCE_ID,
  explorerSurfaceServices,
  INVOICES_SCHEMA,
  MATERIALIZED_VIEW_SCHEMA,
  ordered,
  SALES_SCHEMA,
  SCHEMA_MAP_SCHEMAS,
  SCHEMA_SUMMARY,
  SHIPMENT_EVENT_BULK_TRIGGERS,
  SHIPMENT_EVENT_CONSTRAINTS,
  SHIPMENT_EVENT_PAGINATED_CONSTRAINTS,
  SHIPMENT_EVENT_TRIGGERS,
  SHIPMENTS_COLUMNS_SCHEMA,
  SHIPMENTS_PAGINATED_INDEXES,
  SHIPMENTS_USAGE_INDEXES,
  STALE_CATALOG_SCHEMA,
  STANDARD_VIEW_SCHEMA,
  shipmentEventSchema,
  shipmentIndexesSchema,
  tableResource,
  VIEW_NOTICES,
};
