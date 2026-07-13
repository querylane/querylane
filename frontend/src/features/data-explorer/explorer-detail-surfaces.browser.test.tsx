import { create as createProto } from "@bufbuild/protobuf";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { SchemaDetail } from "@/features/data-explorer/explorer-schema-detail";
import { ExplorerSchemaMap } from "@/features/data-explorer/explorer-schema-map";
import { TableDetail } from "@/features/data-explorer/explorer-table-detail";
import { ViewDetail } from "@/features/data-explorer/explorer-view-detail";
import {
  ColumnSchema,
  ConstraintType,
  DataType,
  IdentityGeneration,
  ListTableColumnsResponseSchema,
  ListTableConstraintsResponseSchema,
  ListTableIndexesResponseSchema,
  ListTablePoliciesResponseSchema,
  ListTableTriggersResponseSchema,
  PolicyCommand,
  PolicyMode,
  ReferentialAction,
  Table_TableType,
  TableConstraintSchema,
  TableIndexSchema,
  TablePolicySchema,
  TableSchema,
  TableTriggerSchema,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  View_ViewType,
  ViewSchema,
} from "@/protogen/querylane/console/v1alpha1/view_pb";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  const linkExportName = "Link";
  return {
    ...actual,
    [linkExportName]: ({
      children,
      className,
    }: {
      children: ReactNode;
      className?: string | undefined;
    }) => (
      <a className={className} href="#referenced-table">
        {children}
      </a>
    ),
  };
});

const ACTIVE_KIND_FILTER_RE = /^Kind.*Materialized views/;
const ACTIVE_OWNER_FILTER_RE = /^Owner.*analytics_owner/;
const KIND_FILTER_RE = /^Kind$/;
const OWNER_FILTER_RE = /^Owner$/;
const SCHEMA_MAP_ALL_CHIP_RE = /^All 7$/;
const SCHEMA_MAP_FILTER_RE = /^Schema$/;
const SCHEMA_MAP_ACTIVE_FILTER_RE = /^Schema.*catalog/;
const SCHEMA_MAP_KEY_ABBREVIATION_RE = /\b(?:FK|IDX|PK)\b/;
const DEFAULT_BROWSER_VIEWPORT = { height: 1000, width: 1280 } as const;
const SCHEMA_MAP_BROWSER_VIEWPORT = { height: 1400, width: 2048 } as const;

// 2024-01-01T23:00:00Z renders as "Last fetched 11:00:00 PM" under the pinned
// TZ=GMT used for screenshots, matching the mocked data grid label below.
const ACCOUNT_REFERENCE_CELL_RE = /→public\.accounts\.id/;
const APP_READER_SUPPORT_AGENT_RE = /app_reader, support_agent/;
const CUSTOMER_ID_CELL_RE = /customer_id/;
const EXACT_DECIMAL_RE = /Exact decimal/;
const PARTITION_2024_BOUND_RE = /FOR VALUES FROM \('2024-01-01'\)/;
const PARTITION_Q1_ROW_RE = /change_log_2026_q1.*1\.02M/;
const PARTITION_Q2_ROW_RE = /change_log_2026_q2.*1\.18M/;
const PARTITION_Q3_ROW_RE = /change_log_2026_q3 CURRENT.*48k/;
const PARTITION_DEFAULT_ROW_RE = /change_log_archive DEFAULT.*1\.94M/;
const PARTITION_DEFAULT_FILTER_RE = /^Bound kind.*Default/;
const PARTITION_PAGE_FOUR_RE = /Showing 1–4 of 4/;
const PARTITION_PAGE_ONE_RE = /Showing 1–10 of 12/;
const PARTITION_PAGE_TWO_RE = /Showing 11–12 of 12/;
const PARTITION_PAGE_ALL_RE = /Showing 1–12 of 12/;
const PARTITION_REDESIGN_FETCHED_AT = Date.parse("2026-07-07T22:51:48Z");
const LAST_FETCHED_11_PM_RE = /Last fetched 11:00:00 PM/;
const POLICIES_ONE_TAB_RE = /^Policies\s+1$/;
const TABLE_COLUMNS_LAST_FETCHED_RE = /4 columns · base table · Last fetched/;
const TRIGGERS_ONE_TAB_RE = /^Triggers\s+1$/;
const UTC_NORMALIZED_INSTANT_RE = /UTC-normalized instant/;
const refreshableQueryFields = vi.hoisted(() => ({
  dataUpdatedAt: 1_704_150_000_000,
  isFetching: false,
  refetch: () => Promise.resolve(),
}));
const tableQueries = vi.hoisted(() => ({
  columns: {
    data: undefined as unknown,
    error: null,
    isLoading: false,
    ...refreshableQueryFields,
  },
  constraints: {
    data: undefined as unknown,
    error: null,
    isLoading: false,
    ...refreshableQueryFields,
  },
  indexes: {
    data: undefined as unknown,
    error: null,
    isLoading: false,
    ...refreshableQueryFields,
  },
  partitionMetadata: {
    data: {
      partitionMetadata: {
        childPartitions: [],
        parentTable: "",
        partitionBound: "",
        partitionCount: 0,
        partitionKey: "",
      },
    } as unknown,
    error: null,
    isLoading: false,
    ...refreshableQueryFields,
  },
  policies: {
    data: undefined as unknown,
    error: null,
    isLoading: false,
    ...refreshableQueryFields,
  },
  triggers: {
    data: undefined as unknown,
    error: null,
    isLoading: false,
    ...refreshableQueryFields,
  },
}));
const sqlQueryState = vi.hoisted(() => ({
  data: undefined as { notices: string[] } | undefined,
  error: null as Error | null,
  isFetching: false,
  refetch: () => Promise.resolve(),
}));
const schemaMapCatalog = vi.hoisted(() => ({
  columnsByTable: {} as Record<string, unknown[]>,
  constraintsByTable: {} as Record<string, unknown[]>,
  errorMethods: [] as string[],
  observedQueries: [] as { methodName: string; parent: string }[],
  tablesBySchema: {} as Record<string, unknown[]>,
  truncatedSchemas: [] as string[],
  viewsBySchema: {} as Record<string, unknown[]>,
}));

function requireFacetFilterBar(description: string) {
  const filterBar = document.querySelector<HTMLElement>(
    '[data-slot="facet-filter-bar"]'
  );
  if (!filterBar) {
    throw new Error(`Expected ${description} to render.`);
  }

  return filterBar;
}

vi.mock("@/components/data-grid/table-data-grid/table-data-grid", () =>
  Object.fromEntries([
    [
      "TableDataGrid",
      ({
        children,
      }: {
        children?: (state: {
          grid: React.ReactNode;
          lastFetchedLabel: string;
        }) => React.ReactNode;
      }) => {
        const grid = (
          <div className="rounded-lg border border-border bg-muted/20 p-4 text-muted-foreground text-sm">
            Data grid visual covered separately.
          </div>
        );

        if (children) {
          return (
            <>
              {children({
                grid,
                lastFetchedLabel: "Last fetched 11:00:00 PM",
              })}
            </>
          );
        }

        return grid;
      },
    ],
  ])
);

vi.mock("@connectrpc/connect-query", async () => {
  const actual = await vi.importActual<
    typeof import("@connectrpc/connect-query")
  >("@connectrpc/connect-query");

  return {
    ...actual,
    useTransport: () => ({}),
  };
});

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query"
  );

  function schemaNameFromParent(parent: string | undefined) {
    return parent?.split("/").at(-1) ?? "";
  }

  function result(data: unknown, error: Error | null = null) {
    return {
      data,
      error,
      isFetching: false,
      isLoading: false,
      refetch: () => Promise.resolve(),
    };
  }

  function schemaMapQuery(query: unknown) {
    const queryKey = (query as { queryKey?: readonly unknown[] }).queryKey;
    const descriptor = queryKey?.[1] as
      | { input?: { parent?: string }; methodName?: string }
      | undefined;
    const parent = descriptor?.input?.parent;
    const methodName = descriptor?.methodName ?? "";
    schemaMapCatalog.observedQueries.push({
      methodName,
      parent: parent ?? "",
    });
    const error = schemaMapCatalog.errorMethods.includes(methodName)
      ? new Error(`${methodName} failed`)
      : null;

    if (methodName === "ListTables") {
      const schemaName = schemaNameFromParent(parent);
      return result(
        {
          nextPageToken: schemaMapCatalog.truncatedSchemas.includes(schemaName)
            ? "next"
            : "",
          tables: schemaMapCatalog.tablesBySchema[schemaName] ?? [],
        },
        error
      );
    }
    if (methodName === "ListViews") {
      return result(
        {
          views:
            schemaMapCatalog.viewsBySchema[schemaNameFromParent(parent)] ?? [],
        },
        error
      );
    }
    if (methodName === "ListTableColumns") {
      return result(
        {
          columns: schemaMapCatalog.columnsByTable[parent ?? ""] ?? [],
        },
        error
      );
    }
    if (methodName === "ListTableConstraints") {
      return result(
        {
          constraints: schemaMapCatalog.constraintsByTable[parent ?? ""] ?? [],
        },
        error
      );
    }

    return result({});
  }

  return {
    ...actual,
    useQueries: ({ queries }: { queries: unknown[] }) =>
      queries.map(schemaMapQuery),
  };
});

vi.mock("@/hooks/api/table", () => ({
  tablesForSchemaQueryInput: ({
    databaseId,
    instanceId,
    schemaId,
  }: {
    databaseId: string;
    instanceId: string;
    schemaId: string;
  }) => ({
    parent: schemaResource(schemaId)
      .replace("instances/prod", `instances/${instanceId}`)
      .replace("databases/logistics", `databases/${databaseId}`),
  }),
  useGetTablePartitionMetadataQuery: () => tableQueries.partitionMetadata,
  useListTableColumnsQuery: () => tableQueries.columns,
  useListTableConstraintsQuery: () => tableQueries.constraints,
  useListTableIndexesQuery: () => tableQueries.indexes,
  useListTablePoliciesQuery: () => tableQueries.policies,
  useListTableTriggersQuery: () => tableQueries.triggers,
}));

vi.mock("@/hooks/api/sql", () => ({
  useExplainQuery: () => sqlQueryState,
}));

function renderExplorerSurface(
  children: React.ReactNode,
  surfaceWidthClassName = "w-[1100px]"
) {
  render(
    <ScreenshotFrame>
      <div
        className={`${surfaceWidthClassName} rounded-2xl border border-border bg-background p-8 text-foreground`}
      >
        {children}
      </div>
    </ScreenshotFrame>
  );
}

function renderScaledExplorerSurface(children: React.ReactNode) {
  render(
    <ScreenshotFrame>
      <div
        className="relative h-[930px] w-[850px] overflow-hidden"
        data-testid="indexes-complex-frame"
      >
        <div
          className="absolute top-0 left-0 w-[1180px] origin-top-left"
          style={{ transform: "scale(0.72)" }}
        >
          <div className="rounded-2xl border border-border bg-background p-8 text-foreground">
            {children}
          </div>
        </div>
      </div>
    </ScreenshotFrame>
  );
}

function resetSqlQueryState() {
  sqlQueryState.data = undefined;
  sqlQueryState.error = null;
  sqlQueryState.isFetching = false;
}

function resetPartitionMetadataQuery() {
  tableQueries.partitionMetadata.data = {
    partitionMetadata: {
      childPartitions: [],
      parentTable: "",
      partitionBound: "",
      partitionCount: 0,
      partitionKey: "",
    },
  };
}

function schemaResource(schemaName: string) {
  return `instances/prod/databases/logistics/schemas/${schemaName}`;
}

function tableResource(schemaName: string, tableName: string) {
  return `${schemaResource(schemaName)}/tables/${tableName}`;
}

function seedSchemaMapVisualCatalog() {
  schemaMapCatalog.errorMethods = [];
  schemaMapCatalog.observedQueries = [];
  schemaMapCatalog.truncatedSchemas = [];
  const table = (schemaName: string, tableName: string, rowCount: bigint) =>
    createProto(TableSchema, {
      displayName: tableName,
      name: tableResource(schemaName, tableName),
      owner: "app_owner",
      rowCount,
      sizeBytes: 128n,
    });
  const column = (
    columnName: string,
    rawType: string,
    options: { primary?: boolean } = {}
  ) =>
    createProto(ColumnSchema, {
      columnName,
      isPrimaryKey: options.primary ?? false,
      rawType,
    });
  const foreignKey = ({
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
  }) =>
    createProto(TableConstraintSchema, {
      columnNames: [columnName],
      constraintName,
      referencedColumnNames: [referencedColumn],
      referencedTable: tableResource(referencedSchema, referencedTable),
      type: ConstraintType.FOREIGN_KEY,
    });

  const carriers = table("shipping", "carriers", 312n);
  const shipments = table("shipping", "shipments", 2_400_000n);
  const shipmentEvent = table("shipping", "shipment_event", 18_200_000n);
  const containers = table("shipping", "containers", 88_000n);
  const ports = table("catalog", "ports", 642n);
  const routes = table("catalog", "routes", 1_800n);
  const changeLog = table("audit", "change_log", 4_200_000n);

  schemaMapCatalog.tablesBySchema = {
    audit: [changeLog],
    catalog: [ports, routes],
    shipping: [carriers, shipments, shipmentEvent, containers],
  };
  schemaMapCatalog.viewsBySchema = { audit: [], catalog: [], shipping: [] };
  schemaMapCatalog.columnsByTable = {
    [carriers.name]: [
      column("id", "int4", { primary: true }),
      column("code", "text"),
      column("name", "text"),
      column("scac", "text"),
      column("active", "bool"),
      column("rating", "numeric(3,2)"),
      column("onboarded_at", "date"),
    ],
    [changeLog.name]: [
      column("id", "int8", { primary: true }),
      column("table_name", "text"),
      column("op", "text"),
      column("actor", "text"),
      column("diff", "jsonb"),
      column("recorded_at", "timestamptz"),
    ],
    [containers.name]: [
      column("id", "int4", { primary: true }),
      column("shipment_id", "uuid"),
      column("iso_code", "text"),
      column("ctype", "text"),
      column("tare_kg", "numeric"),
    ],
    [ports.name]: [
      column("id", "int4", { primary: true }),
      column("code", "text"),
      column("name", "text"),
      column("country", "text"),
      column("tz", "text"),
    ],
    [routes.name]: [
      column("id", "int4", { primary: true }),
      column("origin_port", "text"),
      column("dest_port", "text"),
      column("transit_days", "int4"),
      column("distance_nm", "int4"),
      column("active", "bool"),
    ],
    [shipmentEvent.name]: [
      column("id", "int8", { primary: true }),
      column("shipment_id", "uuid"),
      column("event", "text"),
      column("location", "text"),
      column("recorded_at", "timestamptz"),
    ],
    [shipments.name]: [
      column("id", "uuid", { primary: true }),
      column("ref", "text"),
      column("carrier_id", "int4"),
      column("status", "shipment_status"),
      column("origin_port", "text"),
      column("dest_port", "text"),
      column("weight_kg", "numeric(10,2)"),
      column("eta", "date"),
      column("created_at", "timestamptz"),
    ],
  };
  schemaMapCatalog.constraintsByTable = {
    [containers.name]: [
      foreignKey({
        columnName: "shipment_id",
        constraintName: "containers_shipment_id_fkey",
        referencedSchema: "shipping",
        referencedTable: "shipments",
      }),
    ],
    [routes.name]: [
      foreignKey({
        columnName: "origin_port",
        constraintName: "routes_origin_port_fkey",
        referencedColumn: "code",
        referencedSchema: "catalog",
        referencedTable: "ports",
      }),
      foreignKey({
        columnName: "dest_port",
        constraintName: "routes_dest_port_fkey",
        referencedColumn: "code",
        referencedSchema: "catalog",
        referencedTable: "ports",
      }),
    ],
    [shipmentEvent.name]: [
      foreignKey({
        columnName: "shipment_id",
        constraintName: "shipment_event_shipment_id_fkey",
        referencedSchema: "shipping",
        referencedTable: "shipments",
      }),
    ],
    [shipments.name]: [
      foreignKey({
        columnName: "carrier_id",
        constraintName: "shipments_carrier_id_fkey",
        referencedSchema: "shipping",
        referencedTable: "carriers",
      }),
    ],
  };

  return {
    schemas: [
      { id: "shipping", name: "shipping", owner: "app_owner" },
      { id: "catalog", name: "catalog", owner: "app_owner" },
      { id: "audit", name: "audit", owner: "app_owner" },
    ],
    shippingTables: [carriers, shipments, shipmentEvent, containers],
  };
}

function seedTableDetailQueries() {
  resetPartitionMetadataQuery();
  tableQueries.columns.data = createProto(ListTableColumnsResponseSchema, {
    columns: [
      createProto(ColumnSchema, {
        columnName: "customer_id",
        dataType: DataType.UUID,
        isNullable: false,
        isPrimaryKey: true,
        ordinalPosition: 1,
        rawType: "uuid",
      }),
      createProto(ColumnSchema, {
        columnName: "status",
        dataType: DataType.STRING,
        defaultValue: "'active'::text",
        isNullable: false,
        ordinalPosition: 2,
        rawType: "text",
      }),
      createProto(ColumnSchema, {
        columnName: "account_id",
        dataType: DataType.UUID,
        isNullable: false,
        ordinalPosition: 3,
        rawType: "uuid",
      }),
      createProto(ColumnSchema, {
        columnName: "metadata",
        dataType: DataType.JSON,
        defaultValue: "'{}'::jsonb",
        isNullable: true,
        ordinalPosition: 4,
        rawType: "jsonb",
      }),
    ],
  });
  tableQueries.constraints.data = createProto(
    ListTableConstraintsResponseSchema,
    {
      constraints: [
        createProto(TableConstraintSchema, {
          columnNames: ["customer_id"],
          constraintName: "customers_pkey",
          definition: "PRIMARY KEY (customer_id)",
          type: ConstraintType.PRIMARY_KEY,
        }),
        createProto(TableConstraintSchema, {
          columnNames: ["account_id"],
          constraintName: "customers_account_id_fkey",
          definition: "FOREIGN KEY (account_id) REFERENCES accounts(id)",
          referencedColumnNames: ["id"],
          referencedTable:
            "instances/prod/databases/app/schemas/public/tables/accounts",
          type: ConstraintType.FOREIGN_KEY,
        }),
      ],
    }
  );
  tableQueries.indexes.data = createProto(ListTableIndexesResponseSchema, {
    indexes: [
      createProto(TableIndexSchema, {
        blocksHit: 989n,
        blocksRead: 11n,
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
        scanCount: 10n,
        sizeBytes: 327_680n,
        tuplesFetched: 8n,
        tuplesRead: 12n,
      }),
      createProto(TableIndexSchema, {
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
      }),
    ],
  });
  tableQueries.policies.data = createProto(ListTablePoliciesResponseSchema, {
    policies: [
      createProto(TablePolicySchema, {
        checkExpression: "account_id = current_setting('app.account_id')::uuid",
        command: PolicyCommand.SELECT,
        mode: PolicyMode.PERMISSIVE,
        policyName: "customers_account_read_policy",
        roles: ["app_reader", "support_agent"],
        usingExpression: "account_id = current_setting('app.account_id')::uuid",
      }),
    ],
  });
  tableQueries.triggers.data = createProto(ListTableTriggersResponseSchema, {
    triggers: [
      createProto(TableTriggerSchema, {
        definition: "EXECUTE FUNCTION audit_customer_changes()",
        enabled: true,
        events: ["INSERT", "UPDATE"],
        functionName: "audit_customer_changes",
        timing: "AFTER",
        triggerName: "customers_audit_trigger",
      }),
    ],
  });
}

function seedDefinitionDesignQueries() {
  tableQueries.columns.data = createProto(ListTableColumnsResponseSchema, {
    columns: [
      createProto(ColumnSchema, {
        columnName: "id",
        dataType: DataType.INTEGER,
        identityGeneration: IdentityGeneration.BY_DEFAULT,
        isIdentity: true,
        isNullable: false,
        ordinalPosition: 1,
        rawType: "int8",
      }),
      createProto(ColumnSchema, {
        columnName: "table_name",
        dataType: DataType.STRING,
        isNullable: false,
        ordinalPosition: 2,
        rawType: "text",
      }),
      createProto(ColumnSchema, {
        columnName: "op",
        dataType: DataType.STRING,
        isNullable: false,
        ordinalPosition: 3,
        rawType: "text",
      }),
      createProto(ColumnSchema, {
        columnName: "actor",
        dataType: DataType.STRING,
        isNullable: false,
        ordinalPosition: 4,
        rawType: "text",
      }),
      createProto(ColumnSchema, {
        columnName: "diff",
        dataType: DataType.JSON,
        isNullable: false,
        ordinalPosition: 5,
        rawType: "jsonb",
      }),
      createProto(ColumnSchema, {
        columnName: "recorded_at",
        dataType: DataType.TIMESTAMP,
        defaultValue: "now()",
        isNullable: false,
        ordinalPosition: 6,
        rawType: "timestamptz",
      }),
    ],
  });
  tableQueries.constraints.data = createProto(
    ListTableConstraintsResponseSchema,
    {
      constraints: [
        createProto(TableConstraintSchema, {
          columnNames: ["id"],
          constraintName: "change_log_pkey",
          definition: "PRIMARY KEY (id)",
          type: ConstraintType.PRIMARY_KEY,
        }),
      ],
    }
  );
  tableQueries.indexes.data = createProto(ListTableIndexesResponseSchema, {
    indexes: [
      createProto(TableIndexSchema, {
        indexName: "change_log_pkey",
        isUnique: true,
        keyColumns: ["id"],
        method: "btree",
        sizeBytes: 98_304n,
      }),
    ],
  });
  tableQueries.partitionMetadata.data = {
    partitionMetadata: {
      childPartitions: [],
      parentTable: "",
      partitionBound: "",
      partitionCount: 0,
      partitionKey: "",
    },
  };
  tableQueries.policies.data = createProto(ListTablePoliciesResponseSchema, {
    policies: [
      createProto(TablePolicySchema, {
        command: PolicyCommand.SELECT,
        mode: PolicyMode.PERMISSIVE,
        policyName: "change_log_actor_read_policy",
        roles: ["audit_reader"],
        usingExpression: "actor = current_user",
      }),
    ],
  });
  tableQueries.triggers.data = createProto(ListTableTriggersResponseSchema, {
    triggers: [
      createProto(TableTriggerSchema, {
        // Full pg_get_triggerdef form, matching what the backend returns.
        definition:
          "CREATE TRIGGER change_log_record_trigger\n  AFTER INSERT OR UPDATE OR DELETE ON audit.change_log\n  FOR EACH ROW EXECUTE FUNCTION audit.record_change()",
        enabled: true,
        events: ["INSERT", "UPDATE", "DELETE"],
        functionName: "audit.record_change",
        timing: "AFTER",
        triggerName: "change_log_record_trigger",
      }),
    ],
  });
}

function seedInvoicePolicies() {
  tableQueries.policies.data = createProto(ListTablePoliciesResponseSchema, {
    policies: [
      createProto(TablePolicySchema, {
        checkExpression: "customer = current_setting('app.tenant')",
        command: PolicyCommand.ALL,
        mode: PolicyMode.PERMISSIVE,
        policyName: "invoices_tenant_all",
        roles: ["app_readwrite"],
        usingExpression: "customer = current_setting('app.tenant')",
      }),
      createProto(TablePolicySchema, {
        command: PolicyCommand.SELECT,
        mode: PolicyMode.PERMISSIVE,
        policyName: "invoices_finance_select",
        roles: ["app_readwrite"],
        usingExpression: "pg_has_role(current_user, 'billing', 'member')",
      }),
      createProto(TablePolicySchema, {
        command: PolicyCommand.SELECT,
        mode: PolicyMode.PERMISSIVE,
        policyName: "invoices_reader_recent",
        roles: ["app_readonly"],
        usingExpression: "issued_at >= now() - interval '90 days'",
      }),
    ],
  });
}

function seedShipmentIndexesRedesignQueries() {
  tableQueries.columns.data = createProto(ListTableColumnsResponseSchema, {
    columns: [
      createProto(ColumnSchema, {
        columnName: "id",
        dataType: DataType.UUID,
        isNullable: false,
        isPrimaryKey: true,
        ordinalPosition: 1,
        rawType: "uuid",
      }),
      createProto(ColumnSchema, {
        columnName: "ref",
        dataType: DataType.STRING,
        isNullable: false,
        ordinalPosition: 2,
        rawType: "text",
      }),
      createProto(ColumnSchema, {
        columnName: "carrier_id",
        dataType: DataType.INTEGER,
        isNullable: false,
        ordinalPosition: 3,
        rawType: "integer",
      }),
      createProto(ColumnSchema, {
        columnName: "status",
        dataType: DataType.STRING,
        isNullable: false,
        ordinalPosition: 4,
        rawType: "shipment_status",
      }),
      createProto(ColumnSchema, {
        columnName: "origin_port",
        dataType: DataType.STRING,
        isNullable: false,
        ordinalPosition: 5,
        rawType: "text",
      }),
      createProto(ColumnSchema, {
        columnName: "dest_port",
        dataType: DataType.STRING,
        isNullable: false,
        ordinalPosition: 6,
        rawType: "text",
      }),
      createProto(ColumnSchema, {
        columnName: "weight_kg",
        dataType: DataType.FLOAT,
        isNullable: false,
        ordinalPosition: 7,
        rawType: "numeric",
      }),
      createProto(ColumnSchema, {
        columnName: "eta",
        dataType: DataType.DATE,
        isNullable: true,
        ordinalPosition: 8,
        rawType: "date",
      }),
      createProto(ColumnSchema, {
        columnName: "created_at",
        dataType: DataType.TIMESTAMP,
        isNullable: false,
        ordinalPosition: 9,
        rawType: "timestamp with time zone",
      }),
    ],
  });
  tableQueries.constraints.data = createProto(
    ListTableConstraintsResponseSchema,
    {
      constraints: [
        createProto(TableConstraintSchema, {
          columnNames: ["id"],
          constraintName: "shipments_pkey",
          definition: "PRIMARY KEY (id)",
          type: ConstraintType.PRIMARY_KEY,
        }),
        createProto(TableConstraintSchema, {
          columnNames: ["ref"],
          constraintName: "shipments_ref_key",
          definition: "UNIQUE (ref)",
          type: ConstraintType.UNIQUE,
        }),
        createProto(TableConstraintSchema, {
          columnNames: ["carrier_id"],
          constraintName: "shipments_carrier_id_fkey",
          definition:
            "FOREIGN KEY (carrier_id) REFERENCES shipping.carriers(id) ON DELETE RESTRICT",
          referencedColumnNames: ["id"],
          referencedTable:
            "instances/prod/databases/logistics/schemas/shipping/tables/carriers",
          type: ConstraintType.FOREIGN_KEY,
        }),
        createProto(TableConstraintSchema, {
          columnNames: ["weight_kg"],
          constraintName: "shipments_weight_positive",
          definition: "CHECK (weight_kg > 0)",
          type: ConstraintType.CHECK,
        }),
        createProto(TableConstraintSchema, {
          columnNames: ["eta", "created_at"],
          constraintName: "shipments_eta_reasonable",
          definition: "CHECK (eta IS NULL OR eta > created_at::date)",
          type: ConstraintType.CHECK,
        }),
      ],
    }
  );
  tableQueries.indexes.data = createProto(ListTableIndexesResponseSchema, {
    indexes: [
      createProto(TableIndexSchema, {
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
        sizeBytes: 312n * 1024n * 1024n,
        tuplesFetched: 48_100_000n,
        tuplesRead: 48_400_000n,
      }),
      createProto(TableIndexSchema, {
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
        sizeBytes: 18n * 1024n * 1024n,
        tuplesFetched: 9_300_000n,
        tuplesRead: 11_200_000n,
      }),
      createProto(TableIndexSchema, {
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
        sizeBytes: 52n * 1024n * 1024n,
        tuplesFetched: 1_200_000n,
        tuplesRead: 2_800_000n,
      }),
      createProto(TableIndexSchema, {
        definition:
          "CREATE INDEX shipments_legacy_ref_idx ON shipping.shipments USING btree (lower(ref))",
        hasExpression: true,
        hasUsageStats: true,
        indexName: "shipments_legacy_ref_idx",
        isValid: true,
        keyParts: ["lower(ref)"],
        method: "btree",
        sizeBytes: 96n * 1024n * 1024n,
      }),
    ],
  });
  tableQueries.policies.data = createProto(ListTablePoliciesResponseSchema, {
    policies: [],
  });
  tableQueries.triggers.data = createProto(ListTableTriggersResponseSchema, {
    triggers: [
      createProto(TableTriggerSchema, {
        definition: "EXECUTE FUNCTION shipping.touch_updated_at()",
        enabled: true,
        events: ["UPDATE"],
        functionName: "shipping.touch_updated_at",
        timing: "BEFORE",
        triggerName: "trg_shipments_touch",
      }),
      createProto(TableTriggerSchema, {
        definition: "EXECUTE FUNCTION audit.log_change()",
        enabled: true,
        events: ["INSERT", "UPDATE", "DELETE"],
        functionName: "audit.log_change",
        timing: "AFTER",
        triggerName: "trg_shipments_audit",
      }),
      createProto(TableTriggerSchema, {
        definition: "EXECUTE FUNCTION shipping.notify_status_change()",
        enabled: false,
        events: ["UPDATE"],
        functionName: "shipping.notify_status_change",
        timing: "AFTER",
        triggerName: "trg_shipments_notify",
      }),
    ],
  });
}

function seedTypeAnnotationQueries() {
  resetPartitionMetadataQuery();
  tableQueries.columns.data = createProto(ListTableColumnsResponseSchema, {
    columns: [
      createProto(ColumnSchema, {
        columnName: "event_time",
        dataType: DataType.TIMESTAMP,
        isNullable: false,
        ordinalPosition: 1,
        rawType: "timestamp with time zone",
      }),
      createProto(ColumnSchema, {
        columnName: "amount",
        dataType: DataType.FLOAT,
        isNullable: false,
        ordinalPosition: 2,
        rawType: "numeric",
      }),
      createProto(ColumnSchema, {
        columnName: "retry_count",
        dataType: DataType.INTEGER,
        isNullable: false,
        ordinalPosition: 3,
        rawType: "bigint",
      }),
      createProto(ColumnSchema, {
        columnName: "metadata",
        dataType: DataType.JSON,
        isNullable: true,
        ordinalPosition: 4,
        rawType: "jsonb",
      }),
    ],
  });
  tableQueries.constraints.data = createProto(
    ListTableConstraintsResponseSchema,
    {
      constraints: [],
    }
  );
  tableQueries.indexes.data = createProto(ListTableIndexesResponseSchema, {
    indexes: [],
  });
  tableQueries.policies.data = createProto(ListTablePoliciesResponseSchema, {
    policies: [],
  });
  tableQueries.triggers.data = createProto(ListTableTriggersResponseSchema, {
    triggers: [],
  });
}

test("data explorer schema detail keeps dense table summaries scannable", async () => {
  renderExplorerSurface(
    <SchemaDetail
      onSelectTable={() => undefined}
      onSelectView={() => undefined}
      owner="data_platform"
      schemaName="customer_success_reporting"
      tables={[
        createProto(TableSchema, {
          displayName: "fact_customer_activity_rollup_daily_archive_2026",
          name: "fact_customer_activity_rollup_daily_archive_2026",
          owner: "data_platform",
          rowCount: 8_400_000n,
          sizeBytes: 1_420_000_000n,
        }),
        createProto(TableSchema, {
          displayName: "customer_accounts",
          name: "customer_accounts",
          owner: "data_platform",
          rowCount: 986_420n,
          sizeBytes: 428_000_000n,
        }),
        createProto(TableSchema, {
          displayName: "subscription_events",
          name: "subscription_events",
          owner: "data_platform",
          rowCount: 1_250_000n,
          sizeBytes: 398_000_000n,
        }),
        createProto(TableSchema, {
          displayName: "dim_region",
          name: "dim_region",
          owner: "data_platform",
          rowCount: 184n,
          sizeBytes: 28_672n,
        }),
      ]}
      tablesError={null}
      tablesLoading={false}
      views={[
        createProto(ViewSchema, {
          displayName: "active_customer_accounts",
          name: "active_customer_accounts",
          owner: "data_platform",
          rowCount: 986_420n,
          sizeBytes: 0n,
          viewType: View_ViewType.STANDARD,
        }),
        createProto(ViewSchema, {
          displayName: "customer_success_daily_rollups",
          name: "customer_success_daily_rollups",
          owner: "data_platform",
          rowCount: 8_400_000n,
          sizeBytes: 512_000_000n,
          viewType: View_ViewType.MATERIALIZED,
        }),
      ]}
      viewsError={null}
      viewsLoading={false}
    />
  );

  await expect
    .element(page.getByRole("heading", { name: "customer_success_reporting" }))
    .toBeVisible();
  await expect
    .element(page.getByText("fact_customer_activity_rollup_daily_archive_2026"))
    .toBeVisible();
  await expect
    .element(page.getByText("customer_success_daily_rollups"))
    .toBeVisible();
  await expect
    .element(page.getByRole("cell", { name: "1.3 GB" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("cell", { name: "488.3 MB" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: KIND_FILTER_RE }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: OWNER_FILTER_RE }))
    .toBeVisible();
  await expect
    .element(page.getByRole("tab", { name: "Objects" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("tab", { name: "Schema map" }))
    .toBeVisible();
  const searchInput = page.getByLabelText("Search objects…").element();
  const objectTable = page.getByRole("table").element();
  expect(
    searchInput.getBoundingClientRect().left -
      objectTable.getBoundingClientRect().left
  ).toBeLessThanOrEqual(8);
  await expect.element(page.getByText("MATERIALIZED")).toBeVisible();
  // The size column is right-aligned: the formatted cell sits flush to the
  // right edge of its cell.
  const sizeCell = page.getByRole("cell", { name: "1.3 GB" }).element();
  const sizeValue = sizeCell.querySelector("span") ?? sizeCell;
  expect(
    sizeCell.getBoundingClientRect().right -
      sizeValue.getBoundingClientRect().right
  ).toBeLessThanOrEqual(24);
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-schema-detail-summary"
  );
});

test("data explorer schema detail captures active object filters", async () => {
  renderExplorerSurface(
    <SchemaDetail
      onSelectTable={() => undefined}
      onSelectView={() => undefined}
      owner="data_platform"
      schemaName="sales"
      tables={[
        createProto(TableSchema, {
          displayName: "orders",
          name: "orders",
          owner: "data_platform",
          rowCount: 120_000n,
          sizeBytes: 80_000_000n,
        }),
      ]}
      tablesError={null}
      tablesLoading={false}
      views={[
        createProto(ViewSchema, {
          displayName: "daily_rollups",
          name: "daily_rollups",
          owner: "analytics_owner",
          rowCount: 4_200n,
          sizeBytes: 4_096_000n,
          viewType: View_ViewType.MATERIALIZED,
        }),
      ]}
      viewsError={null}
      viewsLoading={false}
    />,
    "w-[900px]"
  );

  await page.getByRole("button", { name: KIND_FILTER_RE }).click();
  await page.getByText("Materialized views").last().click();
  await page.getByRole("heading", { name: "sales" }).click();
  await page.getByRole("button", { name: OWNER_FILTER_RE }).click();
  await page.getByText("analytics_owner").last().click();
  await page.getByRole("heading", { name: "sales" }).click();

  await expect.element(page.getByText("daily_rollups")).toBeVisible();
  await expect.element(page.getByText("orders")).not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: ACTIVE_KIND_FILTER_RE }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: ACTIVE_OWNER_FILTER_RE }))
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-schema-active-filters"
  );
});

test("data explorer schema map tab matches the redesign relationship map", async () => {
  const catalog = seedSchemaMapVisualCatalog();
  const onSelectTable = vi.fn();

  await page.viewport(
    SCHEMA_MAP_BROWSER_VIEWPORT.width,
    SCHEMA_MAP_BROWSER_VIEWPORT.height
  );
  try {
    render(
      <ScreenshotFrame>
        <div className="flex h-[1320px] w-[1132px] bg-background text-foreground">
          <ExplorerSchemaMap
            activeSchemaName="shipping"
            databaseId="logistics"
            enabled={true}
            instanceId="prod"
            onSelectTable={onSelectTable}
            schemas={catalog.schemas}
          />
        </div>
      </ScreenshotFrame>
    );

    await expect
      .element(page.getByRole("heading", { name: "Schema map" }))
      .toBeVisible();
    await expect.element(page.getByText("logistics")).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: SCHEMA_MAP_FILTER_RE }))
      .toBeVisible();
    await expect.element(page.getByText("shipment_event")).toBeVisible();
    await expect.element(page.getByText("shipments")).toBeVisible();
    await expect.element(page.getByText("carriers")).toBeVisible();
    await expect.element(page.getByText("change_log")).toBeVisible();
    await expect
      .element(page.getByRole("searchbox", { name: "Find a table" }))
      .toBeVisible();
    await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
      "data-explorer-schema-map"
    );

    const metadataParents = schemaMapCatalog.observedQueries
      .filter(({ methodName }) => methodName === "ListTableColumns")
      .map(({ parent }) => parent);
    expect(metadataParents.length).toBeGreaterThan(0);
    expect(
      metadataParents.every((parent) => parent.includes("/schemas/shipping/"))
    ).toBe(true);

    await page.getByRole("button", { name: SCHEMA_MAP_FILTER_RE }).click();
    await page.getByText("catalog").last().click();
    expect(
      schemaMapCatalog.observedQueries.some(
        ({ methodName, parent }) =>
          methodName === "ListTableColumns" &&
          parent.includes("/schemas/catalog/")
      )
    ).toBe(true);
    await expect
      .element(page.getByRole("button", { name: SCHEMA_MAP_ACTIVE_FILTER_RE }))
      .toBeVisible();
    await page.getByRole("button", { name: "Reset" }).click();

    const map = document.querySelector<SVGElement>(
      'svg[data-testid="schema-map-canvas"]'
    );
    const initialWidth = Number(map?.getAttribute("width"));
    await page.getByRole("button", { name: "Zoom in" }).click();
    expect(Number(map?.getAttribute("width"))).toBeGreaterThan(initialWidth);

    await page.getByRole("button", { name: "shipping.shipments" }).click();
    await expect
      .element(page.getByRole("button", { name: "Open data" }))
      .toBeVisible();
    await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
      "data-explorer-schema-map-selected-table"
    );
    await page.getByRole("button", { name: "Open data" }).click();
    expect(onSelectTable).toHaveBeenCalledWith("shipping", "shipments");

    onSelectTable.mockClear();
    const shipmentsButton = page
      .getByRole("button", { name: "shipping.shipments" })
      .element();
    shipmentsButton.focus();
    shipmentsButton.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })
    );
    expect(onSelectTable).toHaveBeenCalledWith("shipping", "shipments");

    await page
      .getByRole("searchbox", { name: "Find a table" })
      .fill("change_log");
    await expect.element(page.getByText("change_log")).toBeVisible();
    await expect.element(page.getByText("shipments")).not.toBeInTheDocument();
  } finally {
    await page.viewport(
      DEFAULT_BROWSER_VIEWPORT.width,
      DEFAULT_BROWSER_VIEWPORT.height
    );
  }
}, 30_000);

test("data explorer schema map uses a compact schema filter at narrow widths", async () => {
  const catalog = seedSchemaMapVisualCatalog();

  await page.viewport(900, 1000);
  try {
    render(
      <ScreenshotFrame>
        <div className="flex h-[900px] w-[680px] bg-background text-foreground">
          <ExplorerSchemaMap
            activeSchemaName="shipping"
            databaseId="logistics"
            enabled={true}
            instanceId="prod"
            onSelectTable={() => undefined}
            schemas={catalog.schemas}
          />
        </div>
      </ScreenshotFrame>
    );

    await expect
      .element(page.getByRole("button", { name: SCHEMA_MAP_FILTER_RE }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: SCHEMA_MAP_ALL_CHIP_RE }))
      .not.toBeInTheDocument();

    await page.getByRole("button", { name: SCHEMA_MAP_FILTER_RE }).click();
    await page.getByText("catalog").last().click();

    await expect.element(page.getByText("ports")).toBeVisible();
    await expect.element(page.getByText("shipments")).not.toBeInTheDocument();
    await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
      "data-explorer-schema-map-compact-toolbar"
    );
  } finally {
    await page.viewport(
      DEFAULT_BROWSER_VIEWPORT.width,
      DEFAULT_BROWSER_VIEWPORT.height
    );
  }
});

test("data explorer schema map keeps schema labels clear of group borders", async () => {
  const catalog = seedSchemaMapVisualCatalog();

  render(
    <ExplorerSchemaMap
      activeSchemaName="shipping"
      databaseId="logistics"
      enabled={true}
      instanceId="prod"
      onSelectTable={() => undefined}
      schemas={catalog.schemas}
    />
  );

  await expect.element(page.getByTestId("schema-map-canvas")).toBeVisible();

  const canvas = document.querySelector('svg[data-testid="schema-map-canvas"]');
  const firstSchemaGroup = canvas?.querySelector("g");
  const firstHull = firstSchemaGroup?.querySelector("rect");
  const shippingLabel = firstSchemaGroup?.querySelector("text");
  if (
    !(
      firstHull instanceof SVGRectElement &&
      shippingLabel instanceof SVGGraphicsElement
    )
  ) {
    throw new Error("Expected the shipping schema label and hull to render.");
  }

  const labelBox = shippingLabel.getBBox();
  const borderY = Number(firstHull.getAttribute("y"));
  expect(labelBox.y + labelBox.height).toBeLessThanOrEqual(borderY - 4);
});

test("data explorer schema map spells out uppercase key labels", async () => {
  const catalog = seedSchemaMapVisualCatalog();

  render(
    <ExplorerSchemaMap
      activeSchemaName="shipping"
      databaseId="logistics"
      enabled={true}
      instanceId="prod"
      onSelectTable={() => undefined}
      schemas={catalog.schemas}
    />
  );

  await expect.element(page.getByText("PRIMARY KEY").first()).toBeVisible();
  await expect.element(page.getByText("FOREIGN KEY").first()).toBeVisible();
  expect(document.body.textContent).not.toMatch(SCHEMA_MAP_KEY_ABBREVIATION_RE);
});

test("data explorer schema map does not clip table card decoration", async () => {
  const catalog = seedSchemaMapVisualCatalog();

  render(
    <ExplorerSchemaMap
      activeSchemaName="shipping"
      databaseId="logistics"
      enabled={true}
      instanceId="prod"
      onSelectTable={() => undefined}
      schemas={catalog.schemas}
    />
  );

  const tableCardLocator = page.getByRole("button", {
    name: "shipping.carriers",
  });
  await expect.element(tableCardLocator).toBeVisible();
  const tableCard = tableCardLocator.element();
  const cardBoundary = tableCard.closest("foreignObject");
  if (!(cardBoundary instanceof SVGElement)) {
    throw new Error("Expected the table card SVG boundary to render.");
  }

  expect(getComputedStyle(cardBoundary).overflow).toBe("visible");
});

test("data explorer schema map emphasizes incoming and outgoing relationships", async () => {
  const catalog = seedSchemaMapVisualCatalog();

  render(
    <ExplorerSchemaMap
      activeSchemaName="shipping"
      databaseId="logistics"
      enabled={true}
      instanceId="prod"
      onSelectTable={() => undefined}
      schemas={catalog.schemas}
    />
  );

  await expect.element(page.getByText("FOREIGN KEY").first()).toBeVisible();
  await page.getByRole("button", { name: "shipping.shipments" }).click();

  const relationshipPath = (label: string) => {
    const path = document.querySelector(`path[aria-label="${label}"]`);
    if (!(path instanceof SVGPathElement)) {
      throw new Error(`Expected the ${label} relationship to render.`);
    }
    return path;
  };
  const outgoing = relationshipPath(
    "shipments.carrier_id references carriers.id"
  );
  const incoming = relationshipPath(
    "containers.shipment_id references shipments.id"
  );

  for (const connected of [outgoing, incoming]) {
    expect(connected.getAttribute("stroke-dasharray")).toBe("7 5");
    const style = getComputedStyle(connected);
    expect(style.animationName).not.toBe("none");
    expect(style.animationDuration).toBe("0.5s");
    expect(style.animationIterationCount).toBe("infinite");
    expect(style.opacity).toBe("0.95");
  }

  await page.getByRole("button", { name: "shipping.carriers" }).click();
  expect(getComputedStyle(outgoing).opacity).toBe("0.95");
  expect(getComputedStyle(incoming).opacity).toBe("0.1");
});

test("data explorer schema map places controls directly after the schema filter", async () => {
  const catalog = seedSchemaMapVisualCatalog();

  render(
    <ExplorerSchemaMap
      activeSchemaName="shipping"
      databaseId="logistics"
      enabled={true}
      instanceId="prod"
      onSelectTable={() => undefined}
      schemas={catalog.schemas}
    />
  );

  const schemaFilterLocator = page.getByRole("button", {
    name: SCHEMA_MAP_FILTER_RE,
  });
  await expect.element(schemaFilterLocator).toBeVisible();
  const schemaFilter = schemaFilterLocator.element();
  expect(
    schemaFilter.nextElementSibling?.querySelector(
      'input[aria-label="Find a table"]'
    )
  ).not.toBeNull();
});

test("data explorer schema map surfaces partial catalog failures and truncation", async () => {
  const catalog = seedSchemaMapVisualCatalog();
  schemaMapCatalog.errorMethods = ["ListViews"];
  schemaMapCatalog.truncatedSchemas = ["shipping"];

  render(
    <ExplorerSchemaMap
      activeSchemaName="shipping"
      databaseId="logistics"
      enabled={true}
      instanceId="prod"
      onSelectTable={() => undefined}
      schemas={catalog.schemas}
    />
  );

  await expect
    .element(page.getByText("Some schema metadata could not load"))
    .toBeVisible();
  await expect
    .element(
      page.getByText(
        "Some schemas have more objects. This map shows the first loaded page."
      )
    )
    .toBeVisible();
});

test("data explorer materialized view detail stays readable", async () => {
  resetSqlQueryState();

  renderExplorerSurface(
    <ViewDetail
      view={createProto(ViewSchema, {
        comment:
          "Precomputed customer success metrics for account health dashboards.",
        displayName: "customer_success_daily_rollups",
        isPopulated: true,
        lastDdlTime: { seconds: 1_779_292_800n },
        name: "instances/prod/databases/app/schemas/public/views/customer_success_daily_rollups",
        owner: "analytics_owner",
        rowCount: 8_400_000n,
        sizeBytes: 512_000_000n,
        viewType: View_ViewType.MATERIALIZED,
      })}
      viewName="customer_success_daily_rollups"
    />
  );

  await expect
    .element(
      page.getByRole("heading", {
        name: "customer_success_daily_rollups",
      })
    )
    .toBeVisible();
  await expect.element(page.getByText("Materialized view")).toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-view-detail"
  );
});

test("data explorer view notice check displays returned notices", async () => {
  resetSqlQueryState();
  sqlQueryState.data = {
    notices: [
      "NOTICE 00000: planner checked daily_paid_revenue",
      "DETAIL: scan uses the sales.orders source relation",
      "HINT: Refresh the view if estimates look stale",
    ],
  };

  renderExplorerSurface(
    <ViewDetail
      view={createProto(ViewSchema, {
        comment: "Tracks paid revenue by day for finance reporting.",
        definition:
          "SELECT date_trunc('day', paid_at) AS paid_day, sum(amount_cents) AS revenue_cents FROM sales.orders WHERE status = 'paid' GROUP BY 1;",
        displayName: "daily_paid_revenue",
        lastDdlTime: { seconds: 1_779_292_800n },
        name: "instances/prod/databases/app/schemas/public/views/daily_paid_revenue",
        owner: "analytics_owner",
        viewType: View_ViewType.STANDARD,
      })}
      viewName="daily_paid_revenue"
    />,
    "w-[980px]"
  );

  await page.getByRole("button", { name: "Check database notices" }).click();
  await expect
    .element(page.getByRole("heading", { name: "Returned notices" }))
    .toBeVisible();
  await expect
    .element(page.getByText("HINT: Refresh the view if estimates look stale"))
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-view-notices"
  );
});

test("data explorer schema detail highlights stale catalog warnings", async () => {
  renderExplorerSurface(
    <SchemaDetail
      onSelectTable={() => undefined}
      onSelectView={() => undefined}
      owner="data_platform"
      schemaName="public"
      tables={[
        createProto(TableSchema, {
          displayName: "customers",
          name: "customers",
          owner: "data_platform",
          rowCount: 986_420n,
          sizeBytes: 428_000_000n,
        }),
      ]}
      tablesError={null}
      tablesLoading={false}
      tablesSyncNotice={{
        message: "Showing cached catalog. Refresh failed.",
        tone: "warning",
      }}
      views={[]}
      viewsError={null}
      viewsLoading={false}
    />
  );

  await expect
    .element(page.getByText("Showing cached catalog. Refresh failed."))
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-schema-sync-warning"
  );
});

test("data explorer table columns show keys relationships and indexed fields", async () => {
  seedTableDetailQueries();
  renderExplorerSurface(
    <TableDetail
      databaseId="app"
      initialTab="columns"
      instanceId="prod"
      schemaName="public"
      table={createProto(TableSchema, {
        displayName: "customers",
        name: "instances/prod/databases/app/schemas/public/tables/customers",
        owner: "app_owner",
        rowCount: 987_654n,
        sizeBytes: 42_467_328n,
        tableType: Table_TableType.BASE_TABLE,
      })}
      tableName="customers"
    />
  );

  await expect
    .element(page.getByRole("cell", { name: CUSTOMER_ID_CELL_RE }).first())
    .toBeVisible();
  await expect
    .element(page.getByRole("cell", { name: ACCOUNT_REFERENCE_CELL_RE }))
    .toBeVisible();
  await expect.element(page.getByText("INDEXED").first()).toBeVisible();
  await expect
    .element(page.getByText(TABLE_COLUMNS_LAST_FETCHED_RE))
    .toBeVisible();
  await expect
    .element(page.getByText("table · 4 columns"))
    .not.toBeInTheDocument();

  const searchInput = page
    .getByRole("textbox", { name: "Search columns…" })
    .element();
  const filterBar = requireFacetFilterBar("column facet filters");
  expect(filterBar.textContent).toContain("Type");
  expect(filterBar.textContent).toContain("Key");
  expect(filterBar.textContent).not.toContain("__all__");
  expect(filterBar.getBoundingClientRect().left).toBeGreaterThan(
    searchInput.getBoundingClientRect().right
  );
  expect(
    Math.abs(
      filterBar.getBoundingClientRect().top -
        searchInput.getBoundingClientRect().top
    )
  ).toBeLessThanOrEqual(4);

  await expect
    .element(page.getByRole("tab", { exact: true, name: "Columns 4" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("tab", { exact: true, name: "Keys 3" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("tab", { exact: true, name: "Indexes 2" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("tab", { exact: true, name: "Constraints 2" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("tab", { exact: true, name: "Policies 1" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("tab", { exact: true, name: "Triggers 1" }))
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-table-columns"
  );
  await page.getByRole("tab", { exact: true, name: "Keys 3" }).click();
  await expect.element(page.getByText("Primary key").first()).toBeVisible();
  await expect.element(page.getByText("customers_pkey")).toBeVisible();
  await expect.element(page.getByText("Foreign key").first()).toBeVisible();
  await expect
    .element(page.getByText("account_id → public.accounts(id)"))
    .toBeVisible();
  await expect.element(page.getByText("Secondary index").first()).toBeVisible();
  await expect
    .element(page.getByText("customers_status_account_idx"))
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-table-keys"
  );
});

test("data explorer table columns show generated and identity metadata", async () => {
  seedTableDetailQueries();
  tableQueries.columns.data = createProto(ListTableColumnsResponseSchema, {
    columns: [
      createProto(ColumnSchema, {
        columnName: "id",
        dataType: DataType.INTEGER,
        identityGeneration: IdentityGeneration.BY_DEFAULT,
        isIdentity: true,
        isNullable: false,
        isPrimaryKey: true,
        ordinalPosition: 1,
        rawType: "bigint",
      }),
      createProto(ColumnSchema, {
        columnName: "email",
        dataType: DataType.STRING,
        isNullable: false,
        ordinalPosition: 2,
        rawType: "text",
      }),
      createProto(ColumnSchema, {
        columnName: "email_lower",
        dataType: DataType.STRING,
        generationExpression: "lower(email)",
        isGenerated: true,
        isNullable: true,
        ordinalPosition: 3,
        rawType: "text",
      }),
    ],
  });

  renderExplorerSurface(
    <TableDetail
      databaseId="app"
      initialTab="columns"
      instanceId="prod"
      schemaName="public"
      table={createProto(TableSchema, {
        displayName: "customers",
        name: "instances/prod/databases/app/schemas/public/tables/customers",
        owner: "app_owner",
        tableType: Table_TableType.BASE_TABLE,
      })}
      tableName="customers"
    />
  );

  await expect.element(page.getByText("IDENTITY")).toBeVisible();
  await expect.element(page.getByText("BY DEFAULT")).toBeVisible();
  await expect.element(page.getByText("GENERATED")).toBeVisible();
  await expect.element(page.getByText("AS lower(email)")).toBeVisible();
});

test("data explorer table tabs stay visible when column metadata overflows", async () => {
  seedTableDetailQueries();
  render(
    <ScreenshotFrame>
      <div className="flex h-[320px] w-[1100px] flex-col overflow-hidden rounded-2xl border border-border bg-background p-8 text-foreground">
        <TableDetail
          databaseId="app"
          initialTab="data"
          instanceId="prod"
          schemaName="public"
          table={createProto(TableSchema, {
            displayName: "customers",
            name: "instances/prod/databases/app/schemas/public/tables/customers",
            owner: "app_owner",
            rowCount: 987_654n,
            sizeBytes: 42_467_328n,
            tableType: Table_TableType.BASE_TABLE,
          })}
          tableName="customers"
        />
      </div>
    </ScreenshotFrame>
  );

  await page.getByRole("tab", { exact: true, name: "Columns 4" }).click();

  const tabsList = document.querySelector('[data-slot="tabs-list"]');
  const tabsScroller = tabsList?.parentElement;
  if (!(tabsList && tabsScroller)) {
    throw new Error("Expected table detail tabs to render.");
  }

  expect(tabsScroller.getBoundingClientRect().height).toBeGreaterThanOrEqual(
    tabsList.getBoundingClientRect().height
  );
});

test("data explorer table indexes have a redesigned card baseline", async () => {
  seedTableDetailQueries();
  renderExplorerSurface(
    <TableDetail
      databaseId="app"
      initialTab="indexes"
      instanceId="prod"
      schemaName="public"
      table={createProto(TableSchema, {
        displayName: "customers",
        name: "instances/prod/databases/app/schemas/public/tables/customers",
        owner: "app_owner",
        rowCount: 987_654n,
        sizeBytes: 42_467_328n,
        tableType: Table_TableType.BASE_TABLE,
      })}
      tableName="customers"
    />
  );

  await expect
    .element(page.getByText("customers_status_account_idx").first())
    .toBeVisible();
  await expect.element(page.getByText("btree").first()).toBeVisible();
  await expect.element(page.getByText("Scans").first()).toBeVisible();
  await expect.element(page.getByText("since last stats reset")).toBeVisible();
  const indexSearch = page
    .getByRole("textbox", { name: "Search indexes…" })
    .element();
  const indexFilterBar = requireFacetFilterBar("index facet filters");
  await expect
    .element(page.getByRole("button", { exact: true, name: "Method" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("combobox", { name: "Indexes per page" }))
    .toBeVisible();
  const searchBox = indexSearch.getBoundingClientRect();
  const filterBox = indexFilterBar.getBoundingClientRect();
  expect(filterBox.left).toBeGreaterThan(searchBox.right);
  expect(Math.abs(filterBox.top - searchBox.top)).toBeLessThanOrEqual(1);
  await expect
    .element(
      page.getByRole("button", {
        name: "Scans. Usage source: pg_stat_user_indexes.",
      })
    )
    .toBeVisible();
  expect(document.body.textContent).not.toContain("Usage from");
  await expect
    .element(page.getByText("INCLUDE last_seen_at").first())
    .toBeVisible();
  expect(document.body.textContent).toContain(
    "CREATE INDEX customers_status_account_idx ON public.customers USING btree (status, account_id) INCLUDE (last_seen_at)"
  );
  expect(document.body.textContent).toContain(
    "CREATE UNIQUE INDEX customers_pkey ON public.customers USING btree (customer_id)"
  );
  const copyButton = page
    .getByRole("button", { name: "Copy SQL" })
    .first()
    .element();
  const sqlBlock = copyButton.parentElement;
  if (!sqlBlock) {
    throw new Error("Expected Copy SQL to render inside its SQL block.");
  }
  const copyBox = copyButton.getBoundingClientRect();
  const sqlBlockBox = sqlBlock.getBoundingClientRect();
  const copyCenter = copyBox.top + copyBox.height / 2;
  const sqlBlockCenter = sqlBlockBox.top + sqlBlockBox.height / 2;
  expect(Math.abs(copyCenter - sqlBlockCenter)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-table-indexes"
  );
});

test("data explorer table indexes constraints policies and triggers stay readable", async () => {
  seedTableDetailQueries();
  renderExplorerSurface(
    <TableDetail
      databaseId="app"
      initialTab="indexes"
      instanceId="prod"
      schemaName="public"
      table={createProto(TableSchema, {
        displayName: "customers",
        name: "instances/prod/databases/app/schemas/public/tables/customers",
        owner: "app_owner",
        rowCount: 987_654n,
        sizeBytes: 42_467_328n,
        tableType: Table_TableType.BASE_TABLE,
      })}
      tableName="customers"
    />
  );

  await expect
    .element(page.getByText("customers_status_account_idx").first())
    .toBeVisible();
  await expect.element(page.getByText("btree").first()).toBeVisible();
  await expect.element(page.getByText("Scans").first()).toBeVisible();
  await expect.element(page.getByText("since last stats reset")).toBeVisible();
  await expect
    .element(
      page.getByRole("button", {
        name: "Scans. Usage source: pg_stat_user_indexes.",
      })
    )
    .toBeVisible();
  expect(document.body.textContent).not.toContain("Usage from");
  await expect
    .element(page.getByText("INCLUDE last_seen_at").first())
    .toBeVisible();
  expect(document.body.textContent).toContain(
    "CREATE INDEX customers_status_account_idx ON public.customers USING btree (status, account_id) INCLUDE (last_seen_at)"
  );
  expect(document.body.textContent).toContain(
    "CREATE UNIQUE INDEX customers_pkey ON public.customers USING btree (customer_id)"
  );

  await page.getByRole("tab", { exact: true, name: "Constraints 2" }).click();
  await expect
    .element(
      page.getByRole("heading", {
        exact: true,
        name: "Keys primary key and uniqueness",
      })
    )
    .toBeVisible();
  await expect
    .element(
      page.getByRole("heading", {
        exact: true,
        name: "Foreign keys outbound references from this table",
      })
    )
    .toBeVisible();
  await expect.element(page.getByText("customers_pkey")).toBeVisible();
  await expect
    .element(page.getByText("customers_account_id_fkey"))
    .toBeVisible();
  await expect.element(page.getByText("public.accounts ↗")).toBeVisible();
  expect(
    document.querySelector('[data-slot="facet-filter-bar"]')
  ).not.toBeNull();
  expect(document.querySelector("table")).toBeNull();

  await page.getByRole("tab", { exact: true, name: "Policies 1" }).click();
  await expect
    .element(
      page.getByRole("heading", {
        exact: true,
        name: "customers_account_read_policy",
      })
    )
    .toBeVisible();
  await expect
    .element(page.getByText(APP_READER_SUPPORT_AGENT_RE))
    .toBeVisible();
  await expect
    .element(page.getByText("How the server combines these"))
    .toBeVisible();
  await expect
    .element(page.getByRole("combobox", { name: "Policy command" }))
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-table-policies"
  );

  await page.getByRole("tab", { exact: true, name: "Triggers 1" }).click();
  await expect.element(page.getByText("customers_audit_trigger")).toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-table-triggers"
  );
});

test("data explorer constraints tab matches redesign card groups", async () => {
  seedTableDetailQueries();
  tableQueries.columns.data = createProto(ListTableColumnsResponseSchema, {
    columns: [
      createProto(ColumnSchema, {
        columnName: "id",
        dataType: DataType.INTEGER,
        isNullable: false,
        isPrimaryKey: true,
        ordinalPosition: 1,
        rawType: "int8",
      }),
      createProto(ColumnSchema, {
        columnName: "shipment_id",
        dataType: DataType.UUID,
        isNullable: false,
        ordinalPosition: 2,
        rawType: "uuid",
      }),
      createProto(ColumnSchema, {
        columnName: "event",
        dataType: DataType.STRING,
        isNullable: false,
        ordinalPosition: 3,
        rawType: "text",
      }),
      createProto(ColumnSchema, {
        columnName: "recorded_at",
        dataType: DataType.TIMESTAMP,
        isNullable: false,
        ordinalPosition: 4,
        rawType: "timestamptz",
      }),
    ],
  });
  tableQueries.constraints.data = createProto(
    ListTableConstraintsResponseSchema,
    {
      constraints: [
        createProto(TableConstraintSchema, {
          columnNames: ["id"],
          constraintName: "shipment_event_pkey",
          definition: "PRIMARY KEY (id)",
          type: ConstraintType.PRIMARY_KEY,
        }),
        createProto(TableConstraintSchema, {
          columnNames: ["shipment_id"],
          constraintName: "shipment_event_shipment_id_fkey",
          definition:
            "FOREIGN KEY (shipment_id) REFERENCES shipping.shipments(id) ON DELETE CASCADE",
          onDelete: ReferentialAction.CASCADE,
          referencedColumnNames: ["id"],
          referencedTable:
            "instances/prod/databases/logistics/schemas/shipping/tables/shipments",
          type: ConstraintType.FOREIGN_KEY,
        }),
      ],
    }
  );

  renderExplorerSurface(
    <TableDetail
      databaseId="logistics"
      initialTab="constraints"
      instanceId="prod"
      schemaName="shipping"
      table={createProto(TableSchema, {
        displayName: "shipment_event",
        name: "instances/prod/databases/logistics/schemas/shipping/tables/shipment_event",
        owner: "app_owner",
        rowCount: 18_200_000n,
        sizeBytes: 21_400_000_000n,
        tableType: Table_TableType.BASE_TABLE,
      })}
      tableName="shipment_event"
    />
  );

  await expect
    .element(
      page.getByRole("heading", {
        exact: true,
        name: "Keys primary key and uniqueness",
      })
    )
    .toBeVisible();
  await expect
    .element(
      page.getByRole("heading", {
        exact: true,
        name: "Foreign keys outbound references from this table",
      })
    )
    .toBeVisible();
  await expect
    .element(page.getByText("ON DELETE CASCADE").first())
    .toBeVisible();
  await expect.element(page.getByText("validated")).toBeVisible();
  await expect.element(page.getByText("shipping.shipments ↗")).toBeVisible();
  await expect
    .element(page.getByText("Last fetched 11:00:00 PM", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Refresh" }))
    .toBeVisible();
  await expect
    .element(
      page.getByRole("textbox", {
        name: "Search constraints…",
      })
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: KIND_FILTER_RE }))
    .toBeVisible();
  expect(
    document.querySelector('[data-slot="facet-filter-bar"]')
  ).not.toBeNull();
  expect(document.querySelector("table")).toBeNull();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-table-constraints-redesign"
  );
});

test("data explorer constraints tab paginates dense card groups", async () => {
  seedTableDetailQueries();
  tableQueries.constraints.data = createProto(
    ListTableConstraintsResponseSchema,
    {
      constraints: Array.from({ length: 11 }, (_, index) =>
        createProto(TableConstraintSchema, {
          columnNames: [`status_${index + 1}`],
          constraintName: `shipment_event_status_${index + 1}_check`,
          definition: `CHECK (status_${index + 1} <> '')`,
          type: ConstraintType.CHECK,
        })
      ),
    }
  );

  renderExplorerSurface(
    <TableDetail
      databaseId="logistics"
      initialTab="constraints"
      instanceId="prod"
      schemaName="shipping"
      table={createProto(TableSchema, {
        displayName: "shipment_event",
        name: "instances/prod/databases/logistics/schemas/shipping/tables/shipment_event",
        owner: "app_owner",
        rowCount: 18_200_000n,
        sizeBytes: 21_400_000_000n,
        tableType: Table_TableType.BASE_TABLE,
      })}
      tableName="shipment_event"
    />
  );

  const pagination = page.getByRole("navigation", {
    name: "Constraints pagination",
  });
  await expect.element(pagination).toBeVisible();
  await expect
    .element(page.getByRole("combobox", { name: "Constraints per page" }))
    .toBeVisible();
  await expect.element(page.getByText("Page 1 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect
    .element(page.getByText("shipment_event_status_11_check"))
    .toBeVisible();
  await expect.element(page.getByText("Showing 11–11 of 11")).toBeVisible();
  await expect.element(page.getByText("Page 2 of 2")).toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-table-constraints-pagination"
  );
});

test("data explorer constraints tab covers validation and action states", async () => {
  seedTableDetailQueries();
  tableQueries.constraints.data = createProto(
    ListTableConstraintsResponseSchema,
    {
      constraints: [
        createProto(TableConstraintSchema, {
          columnNames: ["account_id"],
          constraintName: "customers_account_id_fkey",
          definition:
            "FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON UPDATE SET NULL ON DELETE RESTRICT",
          onDelete: ReferentialAction.RESTRICT,
          onUpdate: ReferentialAction.SET_NULL,
          referencedColumnNames: ["id"],
          referencedTable:
            "instances/prod/databases/app/schemas/public/tables/accounts",
          type: ConstraintType.FOREIGN_KEY,
        }),
        createProto(TableConstraintSchema, {
          columnNames: ["status"],
          constraintName: "customers_status_check",
          definition: "CHECK (status IN ('active', 'archived'))",
          type: ConstraintType.CHECK,
        }),
        createProto(TableConstraintSchema, {
          columnNames: ["legacy_status"],
          constraintName: "customers_legacy_status_check",
          definition: "CHECK (legacy_status <> 'deleted') NOT VALID",
          type: ConstraintType.CHECK,
        }),
        createProto(TableConstraintSchema, {
          columnNames: ["active_period"],
          constraintName: "customers_active_period_excl",
          definition: "EXCLUDE USING gist (active_period WITH &&)",
          type: ConstraintType.EXCLUSION,
        }),
      ],
    }
  );

  renderExplorerSurface(
    <TableDetail
      databaseId="app"
      initialTab="constraints"
      instanceId="prod"
      schemaName="public"
      table={createProto(TableSchema, {
        displayName: "customers",
        name: "instances/prod/databases/app/schemas/public/tables/customers",
        owner: "app_owner",
        rowCount: 12_400n,
        sizeBytes: 8_900_000n,
        tableType: Table_TableType.BASE_TABLE,
      })}
      tableName="customers"
    />
  );

  await expect
    .element(page.getByText("ON UPDATE SET NULL").first())
    .toBeVisible();
  await expect
    .element(page.getByText("ON DELETE RESTRICT").first())
    .toBeVisible();
  await expect.element(page.getByText("NOT VALID").first()).toBeVisible();
  await expect
    .element(
      page.getByRole("heading", {
        exact: true,
        name: "Checks row-level validation rules",
      })
    )
    .toBeVisible();
  await expect
    .element(
      page.getByRole("heading", {
        exact: true,
        name: "Other constraints exclusion and other rules",
      })
    )
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-table-constraint-states"
  );
});

test("data explorer table policies explain RLS composition", async () => {
  await page.viewport(1280, 1300);
  seedTableDetailQueries();
  seedInvoicePolicies();
  renderExplorerSurface(
    <TableDetail
      databaseId="billing"
      initialTab="policies"
      instanceId="prod"
      schemaName="billing"
      table={createProto(TableSchema, {
        displayName: "invoices",
        name: "instances/prod/databases/billing/schemas/billing/tables/invoices",
        owner: "app_owner",
        rowCount: 940_000n,
        sizeBytes: 2_100_000_000n,
        tableType: Table_TableType.BASE_TABLE,
      })}
      tableName="invoices"
    />
  );

  await expect
    .element(
      page.getByRole("heading", { exact: true, name: "invoices_tenant_all" })
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("textbox", { name: "Search policies…" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { exact: true, name: "Mode" }))
    .toBeVisible();
  const pageSizeHeight = page
    .getByRole("combobox", { name: "Rows per page" })
    .element()
    .getBoundingClientRect().height;
  expect(pageSizeHeight).toBeGreaterThanOrEqual(28);
  expect(
    page
      .getByRole("button", { name: "Previous policies page" })
      .element()
      .getBoundingClientRect().height
  ).toBe(28);
  expect(
    page
      .getByRole("button", { name: "Next policies page" })
      .element()
      .getBoundingClientRect().height
  ).toBe(28);
  await expect
    .element(page.getByText("2 permissive policies apply", { exact: false }))
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-table-policies-rls-composition"
  );
});

test("data explorer table indexes match the redesign complex usage scenario", async () => {
  seedShipmentIndexesRedesignQueries();
  renderScaledExplorerSurface(
    <TableDetail
      databaseId="logistics"
      initialTab="indexes"
      instanceId="prod"
      schemaName="shipping"
      table={createProto(TableSchema, {
        displayName: "shipments",
        name: "instances/prod/databases/logistics/schemas/shipping/tables/shipments",
        owner: "app_owner",
        rowCount: 2_400_000n,
        sizeBytes: 13_743_895_347n,
        tableType: Table_TableType.BASE_TABLE,
      })}
      tableName="shipments"
    />
  );

  await expect
    .element(page.getByRole("heading", { name: "shipping.shipments" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("tab", { exact: true, name: "Indexes 4" }))
    .toBeVisible();
  await expect.element(page.getByText("shipments_pkey").first()).toBeVisible();
  await expect
    .element(page.getByText("shipments_status_idx").first())
    .toBeVisible();
  await expect
    .element(page.getByText("shipments_carrier_id_idx").first())
    .toBeVisible();
  await expect
    .element(page.getByText("shipments_legacy_ref_idx").first())
    .toBeVisible();
  await expect.element(page.getByText("1 unused")).toBeVisible();
  await expect.element(page.getByText("478 MB")).toBeVisible();
  await expect.element(page.getByText("58.7M")).toBeVisible();
  await expect.element(page.getByText("99.7%")).toBeVisible();
  await expect
    .element(page.getByRole("textbox", { name: "Search indexes…" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { exact: true, name: "Method" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("combobox", { name: "Indexes per page" }))
    .toBeVisible();
  expect(document.body.textContent).toContain(
    "CREATE INDEX shipments_legacy_ref_idx ON shipping.shipments USING btree (lower(ref))"
  );
  await expect(page.getByTestId("indexes-complex-frame")).toMatchScreenshot(
    "data-explorer-table-indexes-complex"
  );
});

test("data explorer table data tab has a visual baseline", async () => {
  seedTableDetailQueries();
  renderExplorerSurface(
    <TableDetail
      databaseId="app"
      initialTab="data"
      instanceId="prod"
      schemaName="public"
      table={createProto(TableSchema, {
        displayName: "customers",
        name: "instances/prod/databases/app/schemas/public/tables/customers",
        owner: "app_owner",
        rowCount: 987_654n,
        sizeBytes: 42_467_328n,
        tableType: Table_TableType.BASE_TABLE,
      })}
      tableName="customers"
    />
  );

  await expect
    .element(page.getByText("Data grid visual covered separately."))
    .toBeVisible();
  await expect
    .element(page.getByText(LAST_FETCHED_11_PM_RE).first())
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-table-data"
  );
});

test("data explorer table definition tab has a visual baseline", async () => {
  seedDefinitionDesignQueries();
  renderExplorerSurface(
    <TableDetail
      databaseId="logistics"
      initialTab="definition"
      instanceId="prod"
      schemaName="audit"
      table={createProto(TableSchema, {
        displayName: "change_log",
        name: "instances/prod/databases/logistics/schemas/audit/tables/change_log",
        owner: "app_owner",
        rowCount: 4_200_000n,
        sizeBytes: 4_187_000_000n,
        tableType: Table_TableType.BASE_TABLE,
      })}
      tableName="change_log"
    />,
    "h-[950px] w-[1100px] overflow-hidden"
  );

  await expect
    .element(page.getByRole("heading", { name: "Create table" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("tab", { name: POLICIES_ONE_TAB_RE }))
    .toBeVisible();
  await expect
    .element(page.getByRole("tab", { name: TRIGGERS_ONE_TAB_RE }))
    .toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Reproduce locally" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Policies" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Triggers" }))
    .toBeVisible();
  await expect
    .element(page.getByText("Copy all steps", { exact: true }))
    .toBeVisible();
  expect(
    document.querySelectorAll(
      'code.language-sql[data-syntax-highlighter="shiki"]'
    ).length
  ).toBeGreaterThan(2);
  const dumpCommand = page
    .getByRole("textbox", { name: "Dump schema only command" })
    .element();
  expect(getComputedStyle(dumpCommand).whiteSpace).toBe("pre");
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-table-definition"
  );
}, 10_000);

test("data explorer definition toolbar keeps refresh reachable when narrow", async () => {
  seedDefinitionDesignQueries();
  renderExplorerSurface(
    <TableDetail
      databaseId="logistics"
      initialTab="definition"
      instanceId="prod"
      schemaName="audit"
      table={createProto(TableSchema, {
        tableType: Table_TableType.BASE_TABLE,
      })}
      tableName="change_log"
    />,
    "w-[420px]"
  );

  await expect
    .element(page.getByText("Schema document", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { exact: true, name: "Refresh" }))
    .toBeVisible();
  const caption = page.getByText("Schema document", { exact: true }).element();
  const toolbar = caption.parentElement;
  const refresh = page
    .getByRole("button", { exact: true, name: "Refresh" })
    .element();
  if (!toolbar) {
    throw new Error("Expected the definition toolbar to render.");
  }

  expect(toolbar.scrollWidth).toBeLessThanOrEqual(toolbar.clientWidth + 1);
  expect(refresh.getBoundingClientRect().right).toBeLessThanOrEqual(
    toolbar.getBoundingClientRect().right + 1
  );
});

test("data explorer index cards keep SQL inside narrow surfaces", async () => {
  seedTableDetailQueries();
  renderExplorerSurface(
    <TableDetail
      databaseId="app"
      initialTab="indexes"
      instanceId="prod"
      schemaName="public"
      table={createProto(TableSchema, {
        displayName: "customers",
        name: "instances/prod/databases/app/schemas/public/tables/customers",
        owner: "app_owner",
        rowCount: 987_654n,
        sizeBytes: 42_467_328n,
        tableType: Table_TableType.BASE_TABLE,
      })}
      tableName="customers"
    />,
    "w-[560px]"
  );

  const sqlText =
    "CREATE INDEX customers_status_account_idx ON public.customers USING btree (status, account_id) INCLUDE (last_seen_at)";
  await expect.element(page.getByText("btree").first()).toBeVisible();
  await expect.element(page.getByText("INCLUDE last_seen_at")).toBeVisible();
  expect(document.body.textContent).toContain(sqlText);

  const sql = [...document.querySelectorAll('[data-language="sql"]')].find(
    (element) => element.textContent?.includes(sqlText)
  );
  if (!sql) {
    throw new Error("Expected index SQL to render.");
  }
  const card = sql.closest('[data-slot="card"]');
  const frame = page.getByTestId("screenshot-frame").element();

  if (!(card && frame)) {
    throw new Error("Expected index SQL to render inside a card.");
  }

  expect(sql.getBoundingClientRect().right).toBeLessThanOrEqual(
    card.getBoundingClientRect().right + 1
  );
  expect(card.getBoundingClientRect().right).toBeLessThanOrEqual(
    frame.getBoundingClientRect().right + 1
  );
});

test("data explorer table columns explain PostgreSQL type semantics", async () => {
  seedTypeAnnotationQueries();
  renderExplorerSurface(
    <TableDetail
      databaseId="app"
      initialTab="columns"
      instanceId="prod"
      schemaName="public"
      table={createProto(TableSchema, {
        displayName: "events",
        name: "instances/prod/databases/app/schemas/public/tables/events",
        owner: "app_owner",
        rowCount: 10n,
        sizeBytes: 4096n,
        tableType: Table_TableType.BASE_TABLE,
      })}
      tableName="events"
    />
  );

  await expect
    .element(page.getByText("timestamp with time zone"))
    .toBeVisible();
  await expect.element(page.getByText("timestamptz")).toBeVisible();
  await expect.element(page.getByText(UTC_NORMALIZED_INSTANT_RE)).toBeVisible();
  await expect.element(page.getByText(EXACT_DECIMAL_RE)).toBeVisible();
  await expect.element(page.getByText("64-bit")).toBeVisible();
  await expect.element(page.getByText("binary JSON").first()).toBeVisible();
});

test("data explorer table empty resource tabs use shared empty panels", async () => {
  seedTableDetailQueries();
  tableQueries.indexes.data = createProto(ListTableIndexesResponseSchema, {
    indexes: [],
  });
  tableQueries.constraints.data = createProto(
    ListTableConstraintsResponseSchema,
    {
      constraints: [],
    }
  );
  tableQueries.policies.data = createProto(ListTablePoliciesResponseSchema, {
    policies: [],
  });
  tableQueries.triggers.data = createProto(ListTableTriggersResponseSchema, {
    triggers: [],
  });

  renderExplorerSurface(
    <TableDetail
      databaseId="app"
      initialTab="indexes"
      instanceId="prod"
      schemaName="public"
      table={createProto(TableSchema, {
        displayName: "customers",
        name: "instances/prod/databases/app/schemas/public/tables/customers",
        owner: "app_owner",
        rowCount: 987_654n,
        sizeBytes: 42_467_328n,
        tableType: Table_TableType.BASE_TABLE,
      })}
      tableName="customers"
    />
  );

  await expect
    .element(page.getByRole("heading", { name: "No indexes" }))
    .toBeVisible();
  await expect
    .element(
      page.getByText(
        "This table does not define secondary or primary-key indexes in the current catalog snapshot."
      )
    )
    .toBeVisible();
  expect(
    document.querySelector(
      '[data-empty-category="indexes"] [data-slot="empty-state-panel"]'
    )
  ).not.toBeNull();
  expect(
    document.querySelector(
      '[data-empty-category="indexes"] [data-slot="empty-icon"] svg'
    )
  ).toBeNull();

  await page.getByRole("tab", { exact: true, name: "Constraints 0" }).click();
  await expect
    .element(page.getByRole("heading", { name: "No constraints" }))
    .toBeVisible();
  expect(
    document.querySelector(
      '[data-empty-category="constraints"] [data-slot="empty-state-panel"]'
    )
  ).not.toBeNull();

  await page.getByRole("tab", { exact: true, name: "Policies 0" }).click();
  await expect
    .element(page.getByRole("heading", { name: "No policies" }))
    .toBeVisible();
  expect(
    document.querySelector(
      '[data-empty-category="policies"] [data-slot="empty-state-panel"]'
    )
  ).not.toBeNull();

  await page.getByRole("tab", { exact: true, name: "Triggers 0" }).click();
  await expect
    .element(page.getByRole("heading", { name: "No triggers" }))
    .toBeVisible();
  expect(
    document.querySelector(
      '[data-empty-category="triggers"] [data-slot="empty-state-panel"]'
    )
  ).not.toBeNull();

  await page.getByRole("tab", { exact: true, name: "Partitions" }).click();
  await expect
    .element(page.getByRole("heading", { name: "Table is not partitioned" }))
    .toBeVisible();
  expect(
    document.querySelector(
      '[data-empty-category="partitions"] [data-slot="empty-state-panel"]'
    )
  ).not.toBeNull();
});

test("data explorer table partitions matches the imported redesign fixture", async () => {
  seedTableDetailQueries();
  tableQueries.partitionMetadata.dataUpdatedAt = PARTITION_REDESIGN_FETCHED_AT;
  tableQueries.columns.data = createProto(ListTableColumnsResponseSchema, {
    columns: [
      createProto(ColumnSchema, {
        columnName: "id",
        dataType: DataType.INTEGER,
        isNullable: false,
        isPrimaryKey: true,
        ordinalPosition: 1,
        rawType: "int8",
      }),
      createProto(ColumnSchema, {
        columnName: "table_name",
        dataType: DataType.STRING,
        isNullable: false,
        ordinalPosition: 2,
        rawType: "text",
      }),
      createProto(ColumnSchema, {
        columnName: "op",
        dataType: DataType.STRING,
        isNullable: false,
        ordinalPosition: 3,
        rawType: "text",
      }),
      createProto(ColumnSchema, {
        columnName: "actor",
        dataType: DataType.STRING,
        isNullable: false,
        ordinalPosition: 4,
        rawType: "text",
      }),
      createProto(ColumnSchema, {
        columnName: "diff",
        dataType: DataType.JSON,
        isNullable: false,
        ordinalPosition: 5,
        rawType: "jsonb",
      }),
      createProto(ColumnSchema, {
        columnName: "recorded_at",
        dataType: DataType.TIMESTAMP,
        isNullable: false,
        ordinalPosition: 6,
        rawType: "timestamptz",
      }),
    ],
  });
  tableQueries.constraints.data = createProto(
    ListTableConstraintsResponseSchema,
    {
      constraints: [
        createProto(TableConstraintSchema, {
          columnNames: ["id"],
          constraintName: "change_log_pkey",
          definition: "PRIMARY KEY (id)",
          type: ConstraintType.PRIMARY_KEY,
        }),
      ],
    }
  );
  tableQueries.indexes.data = createProto(ListTableIndexesResponseSchema, {
    indexes: [
      createProto(TableIndexSchema, {
        indexName: "change_log_pkey",
        isUnique: true,
        keyColumns: ["id"],
        method: "btree",
        sizeBytes: 67_108_864n,
      }),
    ],
  });
  tableQueries.policies.data = createProto(ListTablePoliciesResponseSchema, {
    policies: [],
  });
  tableQueries.triggers.data = createProto(ListTableTriggersResponseSchema, {
    triggers: [],
  });
  tableQueries.partitionMetadata.data = {
    partitionMetadata: {
      childPartitions: [
        {
          displayName: "change_log_2026_q1",
          estimatedRows: 1_020_000n,
          partitionBound: "FOR VALUES FROM ('2026-01-01') TO ('2026-04-01')",
          sizeBytes: 960n * 1024n * 1024n,
          table:
            "instances/prod/databases/app/schemas/audit/tables/change_log_2026_q1",
        },
        {
          displayName: "change_log_2026_q2",
          estimatedRows: 1_180_000n,
          partitionBound: "FOR VALUES FROM ('2026-04-01') TO ('2026-07-01')",
          sizeBytes: 1_181_116_006n,
          table:
            "instances/prod/databases/app/schemas/audit/tables/change_log_2026_q2",
        },
        {
          displayName: "change_log_2026_q3",
          estimatedRows: 48_000n,
          partitionBound: "FOR VALUES FROM ('2026-07-01') TO ('2026-10-01')",
          sizeBytes: 44n * 1024n * 1024n,
          table:
            "instances/prod/databases/app/schemas/audit/tables/change_log_2026_q3",
        },
        {
          displayName: "change_log_archive",
          estimatedRows: 1_940_000n,
          partitionBound: "DEFAULT",
          sizeBytes: 1_932_735_283n,
          table:
            "instances/prod/databases/app/schemas/audit/tables/change_log_archive",
        },
      ],
      parentTable: "",
      partitionBound: "",
      partitionCount: 4,
      partitionKey: "RANGE (recorded_at)",
    },
  };

  renderExplorerSurface(
    <TableDetail
      databaseId="app"
      initialTab="partitions"
      instanceId="prod"
      schemaName="audit"
      table={createProto(TableSchema, {
        displayName: "change_log",
        name: "instances/prod/databases/app/schemas/audit/tables/change_log",
        owner: "app_owner",
        rowCount: 4_200_000n,
        sizeBytes: 4_187_590_000n,
        tableType: Table_TableType.BASE_TABLE,
      })}
      tableName="change_log"
    />
  );

  await expect
    .element(page.getByText("Partition by RANGE (recorded_at)"))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByText("PostgreSQL statistics"))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByText("4 partitions · pruning on", { exact: false }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { exact: true, name: "Refresh" }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("heading", { name: "Rows per partition" }))
    .toBeVisible();
  await expect
    .element(
      page.getByText(
        "equal time ranges · bar height = rows · click a bar to highlight it below"
      )
    )
    .toBeVisible();
  await expect
    .element(
      page.getByRole("button", {
        name: "change_log_2026_q1, 1.02M estimated rows",
      })
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("row", { name: PARTITION_Q1_ROW_RE }))
    .toBeVisible();
  await expect
    .element(page.getByRole("row", { name: PARTITION_Q2_ROW_RE }))
    .toBeVisible();
  await expect
    .element(page.getByRole("row", { name: PARTITION_Q3_ROW_RE }))
    .toBeVisible();
  await expect
    .element(page.getByText("CURRENT · dashed = projected month-end"))
    .toBeVisible();
  await expect
    .element(page.getByRole("row", { name: PARTITION_DEFAULT_ROW_RE }))
    .toBeVisible();
  const partitionSearchInput = page
    .getByRole("textbox", { name: "Search partitions…" })
    .element();
  const partitionFilterBar = requireFacetFilterBar("partition facet filters");
  expect(partitionFilterBar.textContent).toContain("Schema");
  expect(partitionFilterBar.textContent).toContain("Bound kind");
  expect(partitionFilterBar.getBoundingClientRect().left).toBeGreaterThan(
    partitionSearchInput.getBoundingClientRect().right
  );
  expect(
    Math.abs(
      partitionFilterBar.getBoundingClientRect().top -
        partitionSearchInput.getBoundingClientRect().top
    )
  ).toBeLessThanOrEqual(4);

  await page
    .getByRole("textbox", { name: "Search partitions…" })
    .fill("archive");
  await expect
    .element(page.getByRole("row", { name: PARTITION_Q1_ROW_RE }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("row", { name: PARTITION_DEFAULT_ROW_RE }))
    .toBeVisible();
  await page.getByRole("textbox", { name: "Search partitions…" }).fill("");
  await page.getByRole("button", { exact: true, name: "Bound kind" }).click();
  await page.getByRole("option", { exact: true, name: "Default" }).click();
  await expect
    .element(page.getByRole("button", { name: PARTITION_DEFAULT_FILTER_RE }))
    .toBeVisible();
  await expect
    .element(page.getByRole("row", { name: PARTITION_Q1_ROW_RE }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("row", { name: PARTITION_DEFAULT_ROW_RE }))
    .toBeVisible();
  await page.getByRole("button", { exact: true, name: "Reset" }).click();
  await expect
    .element(page.getByRole("row", { name: PARTITION_Q1_ROW_RE }))
    .toBeVisible();
  await expect
    .element(page.getByRole("combobox", { name: "Rows per page" }))
    .toBeVisible();
  await expect.element(page.getByText(PARTITION_PAGE_FOUR_RE)).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Previous page" }))
    .toBeDisabled();
  await expect
    .element(page.getByRole("button", { name: "Next page" }))
    .toBeDisabled();
  await expect
    .element(
      page.getByText("The DEFAULT partition still holds", { exact: false })
    )
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-table-partitions"
  );
});

test("data explorer table partitions paginate large partition lists", async () => {
  seedTableDetailQueries();
  tableQueries.partitionMetadata.dataUpdatedAt = PARTITION_REDESIGN_FETCHED_AT;
  tableQueries.partitionMetadata.data = {
    partitionMetadata: {
      childPartitions: Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? 2027 : 2026;
        return {
          displayName: `change_log_2026_m${String(month).padStart(2, "0")}`,
          estimatedRows: BigInt(month * 1000),
          partitionBound: `FOR VALUES FROM ('2026-${String(month).padStart(
            2,
            "0"
          )}-01') TO ('${nextYear}-${String(nextMonth).padStart(2, "0")}-01')`,
          sizeBytes: BigInt(month * 1024 * 1024),
          table: `instances/prod/databases/app/schemas/audit/tables/change_log_2026_m${String(
            month
          ).padStart(2, "0")}`,
        };
      }),
      parentTable: "",
      partitionBound: "",
      partitionCount: 12,
      partitionKey: "RANGE (recorded_at)",
    },
  };

  renderExplorerSurface(
    <TableDetail
      databaseId="app"
      initialTab="partitions"
      instanceId="prod"
      schemaName="audit"
      table={createProto(TableSchema, {
        displayName: "change_log",
        name: "instances/prod/databases/app/schemas/audit/tables/change_log",
        owner: "app_owner",
        rowCount: 78_000n,
        sizeBytes: 78n * 1024n * 1024n,
        tableType: Table_TableType.BASE_TABLE,
      })}
      tableName="change_log"
    />
  );

  await expect
    .element(page.getByRole("combobox", { name: "Rows per page" }))
    .toBeVisible();
  await expect.element(page.getByText(PARTITION_PAGE_ONE_RE)).toBeVisible();
  await expect.element(page.getByText("change_log_2026_m01")).toBeVisible();
  await expect
    .element(page.getByText("change_log_2026_m11"))
    .not.toBeInTheDocument();

  await page.getByRole("button", { name: "Next page" }).click();
  await expect.element(page.getByText(PARTITION_PAGE_TWO_RE)).toBeVisible();
  await expect.element(page.getByText("change_log_2026_m11")).toBeVisible();
  await expect
    .element(page.getByText("change_log_2026_m01"))
    .not.toBeInTheDocument();

  await page.getByRole("combobox", { name: "Rows per page" }).click();
  await page.getByRole("option", { exact: true, name: "25" }).click();
  await expect.element(page.getByText(PARTITION_PAGE_ALL_RE)).toBeVisible();
  await expect.element(page.getByText("change_log_2026_m01")).toBeVisible();
  await expect.element(page.getByText("change_log_2026_m11")).toBeVisible();
});

test("data explorer table child partition shows parent metadata", async () => {
  seedTableDetailQueries();
  tableQueries.partitionMetadata.data = {
    partitionMetadata: {
      childPartitions: [],
      parentTable:
        "instances/prod/databases/app/schemas/analytics/tables/events",
      partitionBound: "FOR VALUES FROM ('2024-01-01') TO ('2025-01-01')",
      partitionCount: 0,
      partitionKey: "",
    },
  };

  renderExplorerSurface(
    <TableDetail
      databaseId="app"
      initialTab="partitions"
      instanceId="prod"
      schemaName="analytics"
      table={createProto(TableSchema, {
        displayName: "events_2024",
        name: "instances/prod/databases/app/schemas/analytics/tables/events_2024",
        owner: "app_owner",
        rowCount: 1_200_000n,
        sizeBytes: 805_306_368n,
        tableType: Table_TableType.BASE_TABLE,
      })}
      tableName="events_2024"
    />
  );

  await expect.element(page.getByText("Partition bound")).toBeVisible();
  await expect.element(page.getByText("Parent table")).toBeVisible();
  await expect
    .element(page.getByText("analytics.events", { exact: true }))
    .toBeVisible();
  await expect.element(page.getByText(PARTITION_2024_BOUND_RE)).toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-table-child-partition"
  );
});
