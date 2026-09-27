import type { Page } from "playwright/test";
import {
  mockExplorerShell,
  mockTableCatalog,
} from "../tests/data-explorer-fixtures";
import { mockRpc, mockRpcError } from "../tests/helpers";

const EXPLORER_URL = "/instances/production/databases/appdb/explorer";
const MATERIALIZED_VIEW_ID = "customer_success_daily_rollups";
const MATERIALIZED_VIEW_NAME = `instances/production/databases/appdb/schemas/public/views/${MATERIALIZED_VIEW_ID}`;
const MATERIALIZED_VIEW_URL = `${EXPLORER_URL}?schema=public&category=views&name=${MATERIALIZED_VIEW_ID}`;

const materializedView = {
  comment:
    "Precomputed customer success metrics for account health dashboards.",
  displayName: MATERIALIZED_VIEW_ID,
  isPopulated: true,
  name: MATERIALIZED_VIEW_NAME,
  owner: "analytics_owner",
  rowCount: "8400000",
  sizeBytes: "512000000",
  viewType: "VIEW_TYPE_MATERIALIZED",
};

const rollupColumns = [
  {
    columnName: "account_id",
    dataType: "DATA_TYPE_UUID",
    ordinalPosition: 1,
    rawType: "uuid",
  },
  {
    columnName: "account_name",
    dataType: "DATA_TYPE_STRING",
    ordinalPosition: 2,
    rawType: "text",
  },
  {
    columnName: "health_score",
    dataType: "DATA_TYPE_FLOAT",
    ordinalPosition: 3,
    rawType: "numeric",
  },
  {
    columnName: "open_risks",
    dataType: "DATA_TYPE_INTEGER",
    ordinalPosition: 4,
    rawType: "integer",
  },
];

const rollupRows = [
  {
    accountId: "0270a57c-e072-4d91-9c84-7b01a905ad0f",
    accountName: "Northwind Labs",
    healthScore: 92.4,
    openRisks: "1",
    rowKey: "account-1",
  },
  {
    accountId: "833e0217-d442-45db-9351-7d8027df20bd",
    accountName: "Acme Operations",
    healthScore: 76.8,
    openRisks: "3",
    rowKey: "account-2",
  },
  {
    accountId: "cc67d320-72d6-4f05-96dd-4d295378c529",
    accountName: "Globex Retail",
    healthScore: 61.2,
    openRisks: "5",
    rowKey: "account-3",
  },
];

/** Data Explorer shell whose schema list request fails. */
async function mockSchemaLoadError(page: Page) {
  await mockExplorerShell(page);
  await mockRpc(page, "ListTables", { nextPageToken: "", tables: [] });
  await mockRpcError({
    message: "schema rpc failed",
    method: "ListSchemas",
    page,
  });
}

/** Data Explorer with a populated materialized view selected on its data tab. */
async function mockMaterializedViewData(page: Page) {
  await mockExplorerShell(page);
  await mockTableCatalog(page);
  await mockRpc(page, "ListViews", {
    nextPageToken: "",
    views: [materializedView],
  });
  await mockRpc(page, "GetView", { view: materializedView });
  await mockRpc(page, "ListViewDependencies", {
    nextPageToken: "",
    viewDependencies: [],
  });
  await mockRpc(page, "ListTableColumns", { columns: rollupColumns });
  await mockRpc(page, "ListTableConstraints", { constraints: [] });
  await mockRpc(page, "ListTableIndexes", {
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
  });
  await mockRpc(page, "ReadRows", {
    nextPageToken: "",
    resultSet: {
      columns: rollupColumns.map(({ columnName, dataType, rawType }) => ({
        columnName,
        dataType,
        rawType,
      })),
      observedAt: "2026-05-20T10:00:00Z",
      rows: rollupRows.map((row) => ({
        rowKey: row.rowKey,
        values: [
          { value: { stringValue: row.accountId } },
          { value: { stringValue: row.accountName } },
          { value: { doubleValue: row.healthScore } },
          { value: { int64Value: row.openRisks } },
        ],
      })),
    },
  });
}

export {
  EXPLORER_URL,
  MATERIALIZED_VIEW_URL,
  mockMaterializedViewData,
  mockSchemaLoadError,
};
