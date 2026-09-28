import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError, type ServiceImpl } from "@connectrpc/connect";
import type { SchemaService } from "../../protogen/querylane/console/v1alpha1/schema_pb";
import {
  ReadRowsResponseSchema,
  type TableDataService,
  type TableResultRowSchema,
} from "../../protogen/querylane/console/v1alpha1/table_data_pb";
import {
  type ColumnSchema,
  DataType,
  ListTableColumnsResponseSchema,
  ListTableConstraintsResponseSchema,
  ListTableIndexesResponseSchema,
  ListTablesResponseSchema,
  type TableService,
} from "../../protogen/querylane/console/v1alpha1/table_pb";
import {
  GetViewResponseSchema,
  ListViewDependenciesResponseSchema,
  ListViewsResponseSchema,
  View_ViewType,
  ViewSchema,
  type ViewService,
} from "../../protogen/querylane/console/v1alpha1/view_pb";

// One source of Data Explorer page states for rstest (createTestRouterTransport)
// and Playwright (serveService): a schema list that fails, and a populated
// materialized view on its data tab. Relative imports keep this module
// loadable from Playwright specs.

const MATERIALIZED_VIEW_ID = "customer_success_daily_rollups";
const MATERIALIZED_VIEW_NAME = `instances/production/databases/appdb/schemas/public/views/${MATERIALIZED_VIEW_ID}`;

const MATERIALIZED_VIEW = create(ViewSchema, {
  comment:
    "Precomputed customer success metrics for account health dashboards.",
  displayName: MATERIALIZED_VIEW_ID,
  isPopulated: true,
  name: MATERIALIZED_VIEW_NAME,
  owner: "analytics_owner",
  rowCount: 8_400_000n,
  sizeBytes: 512_000_000n,
  viewType: View_ViewType.MATERIALIZED,
});

const ROLLUP_COLUMNS = [
  {
    columnName: "account_id",
    dataType: DataType.UUID,
    ordinalPosition: 1,
    rawType: "uuid",
  },
  {
    columnName: "account_name",
    dataType: DataType.STRING,
    ordinalPosition: 2,
    rawType: "text",
  },
  {
    columnName: "health_score",
    dataType: DataType.FLOAT,
    ordinalPosition: 3,
    rawType: "numeric",
  },
  {
    columnName: "open_risks",
    dataType: DataType.INTEGER,
    ordinalPosition: 4,
    rawType: "integer",
  },
] satisfies MessageInitShape<typeof ColumnSchema>[];

const ROLLUP_ROWS = [
  {
    accountId: "0270a57c-e072-4d91-9c84-7b01a905ad0f",
    accountName: "Northwind Labs",
    healthScore: 92.4,
    openRisks: 1n,
  },
  {
    accountId: "833e0217-d442-45db-9351-7d8027df20bd",
    accountName: "Acme Operations",
    healthScore: 76.8,
    openRisks: 3n,
  },
  {
    accountId: "cc67d320-72d6-4f05-96dd-4d295378c529",
    accountName: "Globex Retail",
    healthScore: 61.2,
    openRisks: 5n,
  },
];

/** The schema list fails, so the explorer shows its retryable error. */
function schemaLoadErrorServices() {
  const schemaService: Partial<ServiceImpl<typeof SchemaService>> = {
    listSchemas: () => {
      throw new ConnectError("schema rpc failed", Code.Internal);
    },
  };
  const tableService: Partial<ServiceImpl<typeof TableService>> = {
    listTables: () => create(ListTablesResponseSchema),
  };
  return { schema: schemaService, table: tableService };
}

/** A populated materialized view whose data tab renders a real grid. */
function materializedViewServices() {
  const tableService: Partial<ServiceImpl<typeof TableService>> = {
    listTableColumns: () =>
      create(ListTableColumnsResponseSchema, { columns: ROLLUP_COLUMNS }),
    listTableConstraints: () => create(ListTableConstraintsResponseSchema),
    listTableIndexes: () =>
      create(ListTableIndexesResponseSchema, {
        indexes: [
          {
            indexName: "customer_success_daily_rollups_account_idx",
            isUnique: true,
            isValid: true,
            keyColumns: ["account_id"],
            keyParts: ["account_id"],
            method: "btree",
          },
        ],
      }),
  };
  const tableDataService: Partial<ServiceImpl<typeof TableDataService>> = {
    readRows: ({ name }) => {
      if (name !== MATERIALIZED_VIEW_NAME) {
        throw new ConnectError(`${name} not found`, Code.NotFound);
      }
      return create(ReadRowsResponseSchema, {
        resultSet: {
          columns: ROLLUP_COLUMNS.map(({ columnName, dataType, rawType }) => ({
            columnName,
            dataType,
            rawType,
          })),
          observedAt: timestampFromDate(new Date("2026-05-20T10:00:00Z")),
          rows: ROLLUP_ROWS.map(
            (
              { accountId, accountName, healthScore, openRisks },
              index
            ): MessageInitShape<typeof TableResultRowSchema> => ({
              rowKey: `account-${index + 1}`,
              values: [
                { value: { kind: { case: "stringValue", value: accountId } } },
                {
                  value: { kind: { case: "stringValue", value: accountName } },
                },
                {
                  value: { kind: { case: "doubleValue", value: healthScore } },
                },
                { value: { kind: { case: "int64Value", value: openRisks } } },
              ],
            })
          ),
        },
      });
    },
  };
  const viewService: Partial<ServiceImpl<typeof ViewService>> = {
    getView: () => create(GetViewResponseSchema, { view: MATERIALIZED_VIEW }),
    listViewDependencies: () => create(ListViewDependenciesResponseSchema),
    listViews: () =>
      create(ListViewsResponseSchema, { views: [MATERIALIZED_VIEW] }),
  };
  return {
    table: tableService,
    tableData: tableDataService,
    view: viewService,
  };
}

export {
  MATERIALIZED_VIEW,
  MATERIALIZED_VIEW_ID,
  MATERIALIZED_VIEW_NAME,
  materializedViewServices,
  schemaLoadErrorServices,
};
