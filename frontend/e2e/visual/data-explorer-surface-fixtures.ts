import type { Page, Route } from "playwright/test";
import { mockExplorerShell } from "../tests/data-explorer-fixtures";
import { fulfillJson } from "../tests/helpers";

// Proto3 JSON fixtures for the data explorer detail surfaces. Every surface is
// reached through the real explorer route; these mocks answer the catalog and
// table-detail RPCs by `parent` / `name`, like the backend would.

type Json = Record<string, unknown>;

/** A proto3 JSON resource: `name` plus any other message fields. */
interface ResourceJson extends Json {
  name: string;
}

/** A proto3 JSON `Column`, with the fields ReadRows echoes back. */
interface ColumnJson extends Json {
  columnName: string;
  isNullable?: boolean;
  rawType: string;
}

/** The request fields the mocks route on. */
interface RpcRequest {
  name: string;
  parent: string;
}

const DATABASE = "instances/production/databases/appdb";
const EXPLORER_URL = "/instances/production/databases/appdb/explorer";
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

interface TableFixture {
  columns?: ColumnJson[];
  constraints?: Json[];
  indexes?: Json[];
  partitionMetadata?: Json;
  policies?: Json[];
  table: ResourceJson;
  triggers?: Json[];
}

interface SchemaFixture {
  name: string;
  owner?: string;
  tables: TableFixture[];
  tablesSyncMetadata?: Json;
  views?: TableFixture[];
}

interface ExplorerSurfaceCatalog {
  explainNotices?: string[];
  schemas: SchemaFixture[];
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

function explorerUrl(search: Record<string, string> = {}) {
  const query = new URLSearchParams(search).toString();
  return query ? `${EXPLORER_URL}?${query}` : EXPLORER_URL;
}

function tableUrl(schema: string, name: string, tab?: string) {
  return explorerUrl({
    category: "tables",
    name,
    schema,
    ...(tab ? { tab } : {}),
  });
}

function stringField(body: unknown, field: keyof RpcRequest) {
  if (typeof body !== "object" || body === null || !(field in body)) {
    return "";
  }
  return String(Reflect.get(body, field));
}

function requestBody(route: Route): RpcRequest {
  const body: unknown = route.request().postDataJSON();
  return {
    name: stringField(body, "name"),
    parent: stringField(body, "parent"),
  };
}

async function mockMethod(
  page: Page,
  method: string,
  respond: (request: RpcRequest) => Json | undefined
) {
  async function handle(route: Route) {
    const request = requestBody(route);
    const target = request.parent || request.name;
    const body = respond(request);
    await fulfillJson(
      route,
      body ?? { code: "not_found", message: `${target} not found` },
      body ? HTTP_OK : HTTP_NOT_FOUND
    );
  }
  await page.route(`**/${method}`, handle);
  await page.route(`**.${method}`, handle);
}

function resourcesByName(catalog: ExplorerSurfaceCatalog) {
  const tables = new Map<string, TableFixture>();
  const views = new Map<string, TableFixture>();
  for (const schema of catalog.schemas) {
    for (const fixture of schema.tables) {
      tables.set(fixture.table.name, fixture);
    }
    for (const fixture of schema.views ?? []) {
      views.set(fixture.table.name, fixture);
    }
  }
  return { tables, views };
}

function schemaRow(schema: SchemaFixture) {
  return {
    displayName: schema.name,
    isSystemSchema: false,
    name: schemaResource(schema.name),
    owner: schema.owner ?? "app_owner",
  };
}

const NOT_PARTITIONED = {
  childPartitions: [],
  parentTable: "",
  partitionBound: "",
  partitionCount: 0,
  partitionKey: "",
};

/** The first-page ReadRows response for any table: two plain text rows. */
function readRowsResponse(columns: ColumnJson[]) {
  const rows = [1, 2].map((row) => ({
    rowKey: `row/${row}`,
    values: columns.map(({ columnName }) => ({
      value: { stringValue: `${columnName}_${row}` },
    })),
  }));
  return {
    nextPageToken: "",
    resultSet: {
      columns: columns.map(({ columnName, isNullable = true, rawType }) => ({
        columnName,
        dataType: "DATA_TYPE_STRING",
        isNullable,
        mayTruncate: false,
        rawType,
      })),
      observedAt: "2024-01-01T23:00:00Z",
      paginationStrategy: "PAGINATION_STRATEGY_KEYSET",
      rowCount: { status: "STATUS_AVAILABLE", value: String(rows.length) },
      rowIdentity: {
        columnNames: [columns[0]?.columnName ?? ""],
        source: "SOURCE_PRIMARY_KEY",
      },
      rows,
    },
  };
}

/**
 * Mocks the explorer app shell plus every catalog and detail RPC for the given
 * schemas, tables, and views.
 */
async function mockExplorerSurfaces(
  page: Page,
  catalog: ExplorerSurfaceCatalog
) {
  await mockExplorerShell(page);
  const { tables, views } = resourcesByName(catalog);
  const detail = (name: string) => tables.get(name) ?? views.get(name);

  await mockMethod(page, "ListSchemas", () => ({
    nextPageToken: "",
    schemas: catalog.schemas.map(schemaRow),
  }));
  await mockMethod(page, "GetSchema", ({ name }) => {
    const schema = catalog.schemas.find(
      (row) => schemaResource(row.name) === name
    );
    return schema ? { schema: schemaRow(schema) } : undefined;
  });
  await mockMethod(page, "ListTables", ({ parent }) => {
    const schema = catalog.schemas.find(
      (row) => schemaResource(row.name) === parent
    );
    return {
      nextPageToken: "",
      tables: schema?.tables.map((fixture) => fixture.table) ?? [],
      ...(schema?.tablesSyncMetadata
        ? { syncMetadata: schema.tablesSyncMetadata }
        : {}),
    };
  });
  await mockMethod(page, "ListViews", ({ parent }) => {
    const schema = catalog.schemas.find(
      (row) => schemaResource(row.name) === parent
    );
    return {
      nextPageToken: "",
      views: schema?.views?.map((fixture) => fixture.table) ?? [],
    };
  });
  await mockMethod(page, "GetTable", ({ name }) => {
    const fixture = tables.get(name);
    return fixture ? { table: fixture.table } : undefined;
  });
  await mockMethod(page, "GetView", ({ name }) => {
    const fixture = views.get(name);
    return fixture ? { view: fixture.table } : undefined;
  });
  await mockMethod(page, "ListTableColumns", ({ parent }) => ({
    columns: detail(parent)?.columns ?? [],
  }));
  await mockMethod(page, "ListTableConstraints", ({ parent }) => ({
    constraints: detail(parent)?.constraints ?? [],
  }));
  await mockMethod(page, "ListTableIndexes", ({ parent }) => ({
    indexes: detail(parent)?.indexes ?? [],
  }));
  await mockMethod(page, "ListTablePolicies", ({ parent }) => ({
    policies: detail(parent)?.policies ?? [],
  }));
  await mockMethod(page, "ListTableTriggers", ({ parent }) => ({
    triggers: detail(parent)?.triggers ?? [],
  }));
  await mockMethod(page, "GetTablePartitionMetadata", ({ name }) => ({
    partitionMetadata: detail(name)?.partitionMetadata ?? NOT_PARTITIONED,
  }));
  await mockMethod(page, "ListViewDependencies", () => ({
    nextPageToken: "",
    viewDependencies: [],
  }));
  await mockMethod(page, "ExplainQuery", () => ({
    notices: catalog.explainNotices ?? [],
    plan: "Seq Scan",
  }));
  await mockMethod(page, "ReadRows", ({ name }) =>
    readRowsResponse(detail(name)?.columns ?? [])
  );
}

// ---------------------------------------------------------------------------
// Builders

function table(
  schemaName: string,
  tableName: string,
  fields: Json = {}
): ResourceJson {
  return {
    displayName: tableName,
    name: tableResource(schemaName, tableName),
    owner: "app_owner",
    tableType: "TABLE_TYPE_BASE_TABLE",
    ...fields,
  };
}

function view(
  schemaName: string,
  viewName: string,
  fields: Json = {}
): ResourceJson {
  return {
    displayName: viewName,
    name: viewResource(schemaName, viewName),
    owner: "data_platform",
    viewType: "VIEW_TYPE_STANDARD",
    ...fields,
  };
}

/** `types` is the proto `DataType` suffix and the PostgreSQL type name. */
function column(
  columnName: string,
  [dataType, rawType]: [string, string],
  fields: Json = {}
): ColumnJson {
  return {
    columnName,
    dataType: `DATA_TYPE_${dataType}`,
    isNullable: false,
    rawType,
    ...fields,
  };
}

/** Numbers columns in declaration order, like `pg_attribute.attnum`. */
function ordered(...columns: ColumnJson[]): ColumnJson[] {
  return columns.map((row, index) => ({ ordinalPosition: index + 1, ...row }));
}

function checkConstraint(columnName: string, constraintName: string) {
  return {
    columnNames: [columnName],
    constraintName,
    definition: `CHECK (${columnName} <> '')`,
    type: "CONSTRAINT_TYPE_CHECK",
  };
}

// ---------------------------------------------------------------------------
// Schema overview

const SCHEMA_SUMMARY: SchemaFixture = {
  name: "customer_success_reporting",
  owner: "data_platform",
  tables: [
    {
      table: table(
        "customer_success_reporting",
        "fact_customer_activity_rollup_daily_archive_2026",
        { owner: "data_platform", rowCount: "8400000", sizeBytes: "1420000000" }
      ),
    },
    {
      table: table("customer_success_reporting", "customer_accounts", {
        owner: "data_platform",
        rowCount: "986420",
        sizeBytes: "428000000",
      }),
    },
    {
      table: table("customer_success_reporting", "subscription_events", {
        owner: "data_platform",
        rowCount: "1250000",
        sizeBytes: "398000000",
      }),
    },
    {
      table: table("customer_success_reporting", "dim_region", {
        owner: "data_platform",
        rowCount: "184",
        sizeBytes: "28672",
      }),
    },
  ],
  views: [
    {
      table: view("customer_success_reporting", "active_customer_accounts", {
        rowCount: "986420",
        sizeBytes: "0",
      }),
    },
    {
      table: view(
        "customer_success_reporting",
        "customer_success_daily_rollups",
        {
          rowCount: "8400000",
          sizeBytes: "512000000",
          viewType: "VIEW_TYPE_MATERIALIZED",
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
        rowCount: "120000",
        sizeBytes: "80000000",
      }),
    },
  ],
  views: [
    {
      table: view("sales", "daily_rollups", {
        owner: "analytics_owner",
        rowCount: "4200",
        sizeBytes: "4096000",
        viewType: "VIEW_TYPE_MATERIALIZED",
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
        rowCount: "986420",
        sizeBytes: "428000000",
      }),
    },
  ],
  tablesSyncMetadata: {
    isStale: true,
    syncStatus: "CATALOG_SYNC_STATUS_ERROR",
  },
};

// ---------------------------------------------------------------------------
// Schema map: three schemas linked by foreign keys.

function mapColumn(name: string, rawType: string, primary = false): ColumnJson {
  return { columnName: name, isPrimaryKey: primary, rawType };
}

function foreignKey({
  columnName,
  constraintName,
  referencedColumn = "id",
  referencedSchema,
  referencedTable,
}: {
  columnName: string;
  constraintName: string;
  referencedColumn?: string;
  referencedSchema: string;
  referencedTable: string;
}): Json {
  return {
    columnNames: [columnName],
    constraintName,
    referencedColumnNames: [referencedColumn],
    referencedTable: tableResource(referencedSchema, referencedTable),
    type: "CONSTRAINT_TYPE_FOREIGN_KEY",
  };
}

function mapTable(
  qualifiedName: `${string}.${string}`,
  rowCount: string,
  { columns, constraints = [] }: { columns: ColumnJson[]; constraints?: Json[] }
): TableFixture {
  const [schemaName = "", tableName = ""] = qualifiedName.split(".");
  return {
    columns,
    constraints,
    table: table(schemaName, tableName, { rowCount, sizeBytes: "128" }),
  };
}

const SCHEMA_MAP_SCHEMAS: SchemaFixture[] = [
  {
    name: "shipping",
    tables: [
      mapTable("shipping.carriers", "312", {
        columns: [
          mapColumn("id", "int4", true),
          mapColumn("code", "text"),
          mapColumn("name", "text"),
          mapColumn("scac", "text"),
          mapColumn("active", "bool"),
          mapColumn("rating", "numeric(3,2)"),
          mapColumn("onboarded_at", "date"),
        ],
      }),
      mapTable("shipping.shipments", "2400000", {
        columns: [
          mapColumn("id", "uuid", true),
          mapColumn("ref", "text"),
          mapColumn("carrier_id", "int4"),
          mapColumn("status", "shipment_status"),
          mapColumn("origin_port", "text"),
          mapColumn("dest_port", "text"),
          mapColumn("weight_kg", "numeric(10,2)"),
          mapColumn("eta", "date"),
          mapColumn("created_at", "timestamptz"),
        ],
        constraints: [
          foreignKey({
            columnName: "carrier_id",
            constraintName: "shipments_carrier_id_fkey",
            referencedSchema: "shipping",
            referencedTable: "carriers",
          }),
        ],
      }),
      mapTable("shipping.shipment_event", "18200000", {
        columns: [
          mapColumn("id", "int8", true),
          mapColumn("shipment_id", "uuid"),
          mapColumn("event", "text"),
          mapColumn("location", "text"),
          mapColumn("recorded_at", "timestamptz"),
        ],
        constraints: [
          foreignKey({
            columnName: "shipment_id",
            constraintName: "shipment_event_shipment_id_fkey",
            referencedSchema: "shipping",
            referencedTable: "shipments",
          }),
        ],
      }),
      mapTable("shipping.containers", "88000", {
        columns: [
          mapColumn("id", "int4", true),
          mapColumn("shipment_id", "uuid"),
          mapColumn("iso_code", "text"),
          mapColumn("ctype", "text"),
          mapColumn("tare_kg", "numeric"),
        ],
        constraints: [
          foreignKey({
            columnName: "shipment_id",
            constraintName: "containers_shipment_id_fkey",
            referencedSchema: "shipping",
            referencedTable: "shipments",
          }),
        ],
      }),
    ],
  },
  // The explorer scopes the map to the active schema; these schemas prove the
  // other schemas stay out of it.
  {
    name: "catalog",
    tables: [
      mapTable("catalog.ports", "642", {
        columns: [mapColumn("id", "int4", true), mapColumn("code", "text")],
      }),
      mapTable("catalog.routes", "1800", {
        columns: [
          mapColumn("id", "int4", true),
          mapColumn("origin_port", "text"),
        ],
      }),
    ],
  },
  {
    name: "audit",
    tables: [
      mapTable("audit.change_log", "4200000", {
        columns: [mapColumn("id", "int8", true), mapColumn("diff", "jsonb")],
      }),
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
        column("account_id", ["UUID", "uuid"]),
        column("health_score", ["FLOAT", "numeric"])
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
          sizeBytes: "67108864",
        },
      ],
      table: view("public", "customer_success_daily_rollups", {
        comment:
          "Precomputed customer success metrics for account health dashboards.",
        isPopulated: true,
        lastDdlTime: "2026-05-20T16:00:00Z",
        owner: "analytics_owner",
        rowCount: "8400000",
        sizeBytes: "512000000",
        viewType: "VIEW_TYPE_MATERIALIZED",
      }),
    },
  ],
};

const STANDARD_VIEW_SCHEMA: SchemaFixture = {
  name: "public",
  tables: [],
  views: [
    {
      table: view("public", "daily_paid_revenue", {
        comment: "Tracks paid revenue by day for finance reporting.",
        definition:
          "SELECT date_trunc('day', paid_at) AS paid_day, sum(amount_cents) AS revenue_cents FROM sales.orders WHERE status = 'paid' GROUP BY 1;",
        lastDdlTime: "2026-05-20T16:00:00Z",
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
  column("customer_id", ["UUID", "uuid"], { isPrimaryKey: true }),
  column("status", ["STRING", "text"], { defaultValue: "'active'::text" }),
  column("account_id", ["UUID", "uuid"]),
  column("metadata", ["JSON", "jsonb"], {
    defaultValue: "'{}'::jsonb",
    isNullable: true,
  })
);

const CUSTOMERS_CONSTRAINTS = [
  {
    columnNames: ["customer_id"],
    constraintName: "customers_pkey",
    definition: "PRIMARY KEY (customer_id)",
    type: "CONSTRAINT_TYPE_PRIMARY_KEY",
  },
  {
    columnNames: ["account_id"],
    constraintName: "customers_account_id_fkey",
    definition: "FOREIGN KEY (account_id) REFERENCES accounts(id)",
    referencedColumnNames: ["id"],
    referencedTable: tableResource("public", "accounts"),
    type: "CONSTRAINT_TYPE_FOREIGN_KEY",
  },
];

const CUSTOMERS_INDEXES = [
  {
    blocksHit: "989",
    blocksRead: "11",
    definition:
      "CREATE INDEX customers_status_account_idx ON public.customers USING btree (status, account_id) INCLUDE (last_seen_at)",
    hasUsageStats: true,
    includedColumns: ["last_seen_at"],
    indexName: "customers_status_account_idx",
    isUnique: false,
    isValid: true,
    keyColumns: ["status", "account_id"],
    keyParts: ["status", "account_id"],
    method: "btree",
    scanCount: "10",
    sizeBytes: "327680",
    tuplesFetched: "8",
    tuplesRead: "12",
  },
  {
    blocksHit: "100",
    definition:
      "CREATE UNIQUE INDEX customers_pkey ON public.customers USING btree (customer_id)",
    hasUsageStats: true,
    indexName: "customers_pkey",
    isUnique: true,
    isValid: true,
    keyColumns: ["customer_id"],
    keyParts: ["customer_id"],
    method: "btree",
    scanCount: "20",
    sizeBytes: "98304",
    tuplesFetched: "18",
    tuplesRead: "20",
  },
];

function customersSchema(overrides: Partial<TableFixture> = {}): SchemaFixture {
  return {
    name: "public",
    tables: [
      {
        columns: CUSTOMERS_COLUMNS,
        constraints: CUSTOMERS_CONSTRAINTS,
        indexes: CUSTOMERS_INDEXES,
        policies: [
          {
            checkExpression:
              "account_id = current_setting('app.account_id')::uuid",
            command: "POLICY_COMMAND_SELECT",
            mode: "POLICY_MODE_PERMISSIVE",
            policyName: "customers_account_read_policy",
            roles: ["app_reader", "support_agent"],
            usingExpression:
              "account_id = current_setting('app.account_id')::uuid",
          },
        ],
        table: table("public", "customers", {
          rowCount: "987654",
          sizeBytes: "42467328",
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

const CUSTOMERS_CONSTRAINT_STATES = [
  {
    columnNames: ["account_id"],
    constraintName: "customers_account_id_fkey",
    definition:
      "FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON UPDATE SET NULL ON DELETE RESTRICT",
    onDelete: "REFERENTIAL_ACTION_RESTRICT",
    onUpdate: "REFERENTIAL_ACTION_SET_NULL",
    referencedColumnNames: ["id"],
    referencedTable: tableResource("public", "accounts"),
    type: "CONSTRAINT_TYPE_FOREIGN_KEY",
  },
  {
    columnNames: ["status"],
    constraintName: "customers_status_check",
    definition: "CHECK (status IN ('active', 'archived'))",
    type: "CONSTRAINT_TYPE_CHECK",
  },
  {
    columnNames: ["legacy_status"],
    constraintName: "customers_legacy_status_check",
    definition: "CHECK (legacy_status <> 'deleted') NOT VALID",
    type: "CONSTRAINT_TYPE_CHECK",
  },
  {
    columnNames: ["active_period"],
    constraintName: "customers_active_period_excl",
    definition: "EXCLUDE USING gist (active_period WITH &&)",
    type: "CONSTRAINT_TYPE_EXCLUSION",
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
          command: "POLICY_COMMAND_ALL",
          mode: "POLICY_MODE_PERMISSIVE",
          policyName: "invoices_tenant_all",
          roles: ["app_readwrite"],
          usingExpression: "customer = current_setting('app.tenant')",
        },
        {
          command: "POLICY_COMMAND_SELECT",
          mode: "POLICY_MODE_PERMISSIVE",
          policyName: "invoices_finance_select",
          roles: ["app_readwrite"],
          usingExpression: "pg_has_role(current_user, 'billing', 'member')",
        },
        {
          command: "POLICY_COMMAND_SELECT",
          mode: "POLICY_MODE_PERMISSIVE",
          policyName: "invoices_reader_recent",
          roles: ["app_readonly"],
          usingExpression: "issued_at >= now() - interval '90 days'",
        },
      ],
      table: table("billing", "invoices", {
        rowCount: "940000",
        sizeBytes: "2100000000",
      }),
    },
  ],
};

// ---------------------------------------------------------------------------
// shipping.shipments: column inventory and index usage.

const SHIPMENTS_TABLE = table("shipping", "shipments", {
  rowCount: "2400000",
  sizeBytes: "12800000000",
});

const SHIPMENTS_COLUMNS_SCHEMA: SchemaFixture = {
  name: "shipping",
  tables: [
    {
      columns: ordered(
        column("id", ["UUID", "uuid"], {
          comment: "Surrogate key",
          defaultValue: "gen_random_uuid()",
          isPrimaryKey: true,
        }),
        column("ref", ["STRING", "text"], {
          comment: "Human-readable booking reference",
          isUnique: true,
        }),
        column("carrier_id", ["INTEGER", "int4"]),
        column("status", ["STRING", "shipment_status"]),
        column("origin_port", ["STRING", "text"]),
        column("dest_port", ["STRING", "text"]),
        column("route_code", ["STRING", "text"], {
          generationExpression: "origin_port || ':' || dest_port",
          isGenerated: true,
        }),
        column("sequence_no", ["INTEGER", "int8"], {
          identityGeneration: "IDENTITY_GENERATION_BY_DEFAULT",
          isIdentity: true,
        }),
        column("weight_kg", ["FLOAT", "numeric(10,2)"]),
        column("eta", ["DATE", "date"], {
          comment: "Set NULL once delivered",
          isNullable: true,
        }),
        column("created_at", ["TIMESTAMP", "timestamptz"], {
          defaultValue: "now()",
        })
      ),
      constraints: [
        {
          columnNames: ["id"],
          constraintName: "shipments_pkey",
          definition: "PRIMARY KEY (id)",
          type: "CONSTRAINT_TYPE_PRIMARY_KEY",
        },
        {
          columnNames: ["ref"],
          constraintName: "shipments_ref_key",
          definition: "UNIQUE (ref)",
          type: "CONSTRAINT_TYPE_UNIQUE",
        },
        {
          columnNames: ["carrier_id"],
          constraintName: "shipments_carrier_id_fkey",
          definition:
            "FOREIGN KEY (carrier_id) REFERENCES shipping.carriers(id)",
          referencedColumnNames: ["id"],
          referencedTable: tableResource("shipping", "carriers"),
          type: "CONSTRAINT_TYPE_FOREIGN_KEY",
        },
      ],
      indexes: [
        {
          indexName: "shipments_pkey",
          isUnique: true,
          keyColumns: ["id"],
          method: "btree",
          sizeBytes: "327155712",
        },
        {
          indexName: "shipments_ref_key",
          isUnique: true,
          keyColumns: ["ref"],
          method: "btree",
          sizeBytes: "104857600",
        },
        {
          indexName: "shipments_status_idx",
          keyColumns: ["status"],
          method: "btree",
          sizeBytes: "18874368",
        },
        {
          indexName: "shipments_carrier_id_idx",
          keyColumns: ["carrier_id"],
          method: "btree",
          sizeBytes: "54525952",
        },
      ],
      table: SHIPMENTS_TABLE,
    },
  ],
};

const MIB = 1_048_576;
// One more row than the default page size of 10, so pagination kicks in.
const DENSE_LIST_LENGTH = 11;
const DENSE_TRIGGER_COUNT = 12;
const TRIGGER_SUFFIX_WIDTH = 2;

const SHIPMENTS_USAGE_INDEXES = [
  {
    blocksHit: "997",
    blocksRead: "3",
    definition:
      "CREATE UNIQUE INDEX shipments_pkey ON shipping.shipments USING btree (id)",
    hasUsageStats: true,
    indexName: "shipments_pkey",
    isUnique: true,
    isValid: true,
    keyColumns: ["id"],
    keyParts: ["id"],
    method: "btree",
    scanCount: "48100000",
    sizeBytes: "327155712",
    tuplesFetched: "48100000",
    tuplesRead: "48400000",
  },
  {
    blocksHit: "989",
    blocksRead: "11",
    definition:
      "CREATE INDEX shipments_status_idx ON shipping.shipments USING btree (status) WHERE status <> 'delivered'",
    hasUsageStats: true,
    indexName: "shipments_status_idx",
    isValid: true,
    keyColumns: ["status"],
    keyParts: ["status"],
    method: "btree",
    predicate: "status <> 'delivered'",
    scanCount: "9400000",
    sizeBytes: "18874368",
    tuplesFetched: "9300000",
    tuplesRead: "11200000",
  },
  {
    blocksHit: "991",
    blocksRead: "9",
    definition:
      "CREATE INDEX shipments_carrier_id_idx ON shipping.shipments USING btree (carrier_id)",
    hasUsageStats: true,
    indexName: "shipments_carrier_id_idx",
    isValid: true,
    keyColumns: ["carrier_id"],
    keyParts: ["carrier_id"],
    method: "btree",
    scanCount: "1200000",
    sizeBytes: "54525952",
    tuplesFetched: "1200000",
    tuplesRead: "2800000",
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
    sizeBytes: "100663296",
  },
];

function shipmentIndexesSchema(indexes: Json[]): SchemaFixture {
  return {
    name: "shipping",
    tables: [
      {
        columns: ordered(
          column("id", ["UUID", "uuid"], { isPrimaryKey: true }),
          column("ref", ["STRING", "text"]),
          column("carrier_id", ["INTEGER", "integer"]),
          column("status", ["STRING", "shipment_status"]),
          column("origin_port", ["STRING", "text"]),
          column("dest_port", ["STRING", "text"]),
          column("weight_kg", ["FLOAT", "numeric"]),
          column("eta", ["DATE", "date"], { isNullable: true }),
          column("created_at", ["TIMESTAMP", "timestamp with time zone"])
        ),
        indexes,
        table: table("shipping", "shipments", {
          rowCount: "2400000",
          sizeBytes: "13743895347",
        }),
      },
    ],
  };
}

const SHIPMENTS_PAGINATED_INDEXES = Array.from(
  { length: DENSE_LIST_LENGTH },
  (_, index) => ({
    indexName: `shipments_route_${index + 1}_idx`,
    isValid: true,
    keyColumns: ["route_id"],
    keyParts: ["route_id"],
    method: index === DENSE_LIST_LENGTH - 1 ? "gin" : "btree",
    sizeBytes: String((index + 1) * MIB),
  })
);

// ---------------------------------------------------------------------------
// shipping.shipment_event: constraints and triggers.

const SHIPMENT_EVENT_TABLE_FIELDS = {
  rowCount: "18200000",
  sizeBytes: "21400000000",
};

function shipmentEventSchema(overrides: Partial<TableFixture>): SchemaFixture {
  return {
    name: "shipping",
    tables: [
      {
        columns: ordered(
          column("id", ["INTEGER", "int8"], { isPrimaryKey: true }),
          column("shipment_id", ["UUID", "uuid"]),
          column("event", ["STRING", "text"]),
          column("recorded_at", ["TIMESTAMP", "timestamptz"])
        ),
        table: table("shipping", "shipment_event", SHIPMENT_EVENT_TABLE_FIELDS),
        ...overrides,
      },
    ],
  };
}

const SHIPMENT_EVENT_CONSTRAINTS = [
  {
    columnNames: ["id"],
    constraintName: "shipment_event_pkey",
    definition: "PRIMARY KEY (id)",
    type: "CONSTRAINT_TYPE_PRIMARY_KEY",
  },
  {
    columnNames: ["shipment_id"],
    constraintName: "shipment_event_shipment_id_fkey",
    definition:
      "FOREIGN KEY (shipment_id) REFERENCES shipping.shipments(id) ON DELETE CASCADE",
    onDelete: "REFERENTIAL_ACTION_CASCADE",
    referencedColumnNames: ["id"],
    referencedTable: tableResource("shipping", "shipments"),
    type: "CONSTRAINT_TYPE_FOREIGN_KEY",
  },
];

const SHIPMENT_EVENT_PAGINATED_CONSTRAINTS = Array.from(
  { length: DENSE_LIST_LENGTH },
  (_, index) =>
    checkConstraint(
      `status_${index + 1}`,
      `shipment_event_status_${index + 1}_check`
    )
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
    const suffix = String(index).padStart(TRIGGER_SUFFIX_WIDTH, "0");
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
  column("id", ["INTEGER", "int8"], {
    identityGeneration: "IDENTITY_GENERATION_BY_DEFAULT",
    isIdentity: true,
  }),
  column("table_name", ["STRING", "text"]),
  column("op", ["STRING", "text"]),
  column("actor", ["STRING", "text"]),
  column("diff", ["JSON", "jsonb"]),
  column("recorded_at", ["TIMESTAMP", "timestamptz"], {
    defaultValue: "now()",
  })
);

const CHANGE_LOG_PRIMARY_KEY = [
  {
    columnNames: ["id"],
    constraintName: "change_log_pkey",
    definition: "PRIMARY KEY (id)",
    type: "CONSTRAINT_TYPE_PRIMARY_KEY",
  },
];

function changeLogIndexes(sizeBytes: string) {
  return [
    {
      indexName: "change_log_pkey",
      isUnique: true,
      keyColumns: ["id"],
      method: "btree",
      sizeBytes,
    },
  ];
}

const CHANGE_LOG_DEFINITION_SCHEMA: SchemaFixture = {
  name: "audit",
  tables: [
    {
      columns: CHANGE_LOG_COLUMNS,
      constraints: CHANGE_LOG_PRIMARY_KEY,
      indexes: changeLogIndexes("98304"),
      policies: [
        {
          command: "POLICY_COMMAND_SELECT",
          mode: "POLICY_MODE_PERMISSIVE",
          policyName: "change_log_actor_read_policy",
          roles: ["audit_reader"],
          usingExpression: "actor = current_user",
        },
      ],
      table: table("audit", "change_log", {
        rowCount: "4200000",
        sizeBytes: "4187000000",
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

const CHANGE_LOG_PARTITIONS_SCHEMA: SchemaFixture = {
  name: "audit",
  tables: [
    {
      columns: ordered(
        column("id", ["INTEGER", "int8"], { isPrimaryKey: true }),
        ...CHANGE_LOG_COLUMNS.slice(1)
      ),
      constraints: CHANGE_LOG_PRIMARY_KEY,
      indexes: changeLogIndexes("67108864"),
      partitionMetadata: {
        childPartitions: [
          {
            displayName: "change_log_2026_q1",
            estimatedRows: "1020000",
            partitionBound: "FOR VALUES FROM ('2026-01-01') TO ('2026-04-01')",
            sizeBytes: "1006632960",
            table: tableResource("audit", "change_log_2026_q1"),
          },
          {
            displayName: "change_log_2026_q2",
            estimatedRows: "1180000",
            partitionBound: "FOR VALUES FROM ('2026-04-01') TO ('2026-07-01')",
            sizeBytes: "1181116006",
            table: tableResource("audit", "change_log_2026_q2"),
          },
          {
            displayName: "change_log_2026_q3",
            estimatedRows: "48000",
            partitionBound: "FOR VALUES FROM ('2026-07-01') TO ('2026-10-01')",
            sizeBytes: "46137344",
            table: tableResource("audit", "change_log_2026_q3"),
          },
          {
            displayName: "change_log_archive",
            estimatedRows: "1940000",
            partitionBound: "DEFAULT",
            sizeBytes: "1932735283",
            table: tableResource("audit", "change_log_archive"),
          },
        ],
        parentTable: "",
        partitionBound: "",
        partitionCount: 4,
        partitionKey: "RANGE (recorded_at)",
      },
      table: table("audit", "change_log", {
        rowCount: "4200000",
        sizeBytes: "4187590000",
      }),
    },
  ],
};

const CHILD_PARTITION_SCHEMA: SchemaFixture = {
  name: "analytics",
  tables: [
    {
      columns: CUSTOMERS_COLUMNS,
      partitionMetadata: {
        ...NOT_PARTITIONED,
        parentTable: tableResource("analytics", "events"),
        partitionBound: "FOR VALUES FROM ('2024-01-01') TO ('2025-01-01')",
      },
      table: table("analytics", "events_2024", {
        rowCount: "1200000",
        sizeBytes: "805306368",
      }),
    },
  ],
};

export type { ExplorerSurfaceCatalog, SchemaFixture, TableFixture };
export {
  CHANGE_LOG_DEFINITION_SCHEMA,
  CHANGE_LOG_PARTITIONS_SCHEMA,
  CHILD_PARTITION_SCHEMA,
  CUSTOMERS_CONSTRAINT_STATES,
  customersSchema,
  explorerUrl,
  INVOICES_SCHEMA,
  MATERIALIZED_VIEW_SCHEMA,
  mockExplorerSurfaces,
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
  tableUrl,
  VIEW_NOTICES,
};
