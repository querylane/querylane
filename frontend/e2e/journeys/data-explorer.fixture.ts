import { HttpResponse } from "msw";
import type { Page } from "playwright/test";
import {
  mockRpc,
  mockRpcResponse,
  mockRpcWith,
} from "./msw-network.test-utils";

import {
  mockApiManagedReadyConsole,
  mockDatabaseDetails,
  mockDatabases,
  mockInstanceCatalog,
  mockInstanceDetails,
  mockReadyOnboarding,
  sampleDatabase,
  sampleInstance,
} from "./querylane-rpc.fixture";

const HTTP_NOT_FOUND = 404;

const ORDERS_TABLE_NAME =
  "instances/production/databases/appdb/schemas/public/tables/orders";

const schemaRows = [
  {
    displayName: "public",
    isSystemSchema: false,
    name: "instances/production/databases/appdb/schemas/public",
    owner: "app_owner",
  },
  {
    displayName: "billing",
    isSystemSchema: false,
    name: "instances/production/databases/appdb/schemas/billing",
    owner: "billing_owner",
  },
];

const publicTables = [
  {
    displayName: "orders",
    name: ORDERS_TABLE_NAME,
    rowCount: "25",
    sizeBytes: "4096",
    tableType: "TABLE_TYPE_BASE_TABLE",
  },
  {
    displayName: "customers",
    name: "instances/production/databases/appdb/schemas/public/tables/customers",
    rowCount: "12",
    sizeBytes: "2048",
    tableType: "TABLE_TYPE_BASE_TABLE",
  },
];

const billingTables = [
  {
    displayName: "invoices",
    name: "instances/production/databases/appdb/schemas/billing/tables/invoices",
    rowCount: "8",
    sizeBytes: "1024",
    tableType: "TABLE_TYPE_BASE_TABLE",
  },
];

const orderColumns = [
  {
    columnName: "id",
    dataType: "DATA_TYPE_INTEGER",
    isNullable: false,
    isPrimaryKey: true,
    mayTruncate: false,
    rawType: "integer",
  },
  {
    columnName: "email",
    dataType: "DATA_TYPE_STRING",
    isNullable: false,
    mayTruncate: false,
    rawType: "text",
  },
  {
    columnName: "payload",
    dataType: "DATA_TYPE_JSON",
    isNullable: true,
    mayTruncate: true,
    rawType: "jsonb",
  },
];

const orderIndexes = [
  {
    includedColumns: [],
    indexName: "orders_pkey",
    isPrimary: true,
    isUnique: true,
    keyColumns: ["id"],
    method: "btree",
    sizeBytes: "16384",
  },
  {
    includedColumns: [],
    indexName: "orders_email_idx",
    isPrimary: false,
    isUnique: false,
    keyColumns: ["email"],
    method: "btree",
    sizeBytes: "8192",
  },
];

const orderConstraints = [
  {
    columnNames: ["id"],
    constraintName: "orders_pkey",
    definition: "PRIMARY KEY (id)",
    referencedColumnNames: [],
    referencedTable: "",
    type: "CONSTRAINT_TYPE_PRIMARY_KEY",
  },
  {
    columnNames: ["customer_id"],
    constraintName: "orders_customer_id_fkey",
    definition: "FOREIGN KEY (customer_id) REFERENCES customers(id)",
    referencedColumnNames: ["id"],
    referencedTable:
      "instances/production/databases/appdb/schemas/public/tables/customers",
    type: "CONSTRAINT_TYPE_FOREIGN_KEY",
  },
];

const orderTriggers = [
  {
    enabled: true,
    events: ["INSERT", "UPDATE"],
    functionName: "audit_orders",
    timing: "AFTER",
    triggerName: "orders_audit_trigger",
  },
];

const orderPolicies = [
  {
    checkExpression: "customer_id = current_setting('app.customer_id')::int",
    command: "POLICY_COMMAND_SELECT",
    mode: "POLICY_MODE_PERMISSIVE",
    policyName: "orders_customer_read_policy",
    roles: ["app_reader"],
    usingExpression: "customer_id = current_setting('app.customer_id')::int",
  },
];

function readRowsResponse({
  email = "ada@example.com",
  nextPageToken = "page-2",
  pageToken,
  rowCount = "25",
}: {
  email?: string;
  nextPageToken?: string;
  pageToken?: unknown;
  rowCount?: string;
} = {}) {
  const rowId = Boolean(pageToken) ? "2" : "1";
  const rowEmail = Boolean(pageToken) ? "grace@example.com" : email;

  return {
    nextPageToken,
    resultSet: {
      columns: orderColumns,
      observedAt: "2026-05-20T10:00:00Z",
      paginationStrategy: "PAGINATION_STRATEGY_KEYSET",
      rowCount: { status: "STATUS_AVAILABLE", value: rowCount },
      rowIdentity: { columnNames: ["id"], source: "SOURCE_PRIMARY_KEY" },
      rows: [
        {
          rowKey: `orders/${rowId}`,
          values: [
            { value: { int64Value: rowId } },
            { value: { stringValue: rowEmail } },
            {
              fullSizeBytes: "80",
              fullValueToken: "payload-token-1",
              truncated: true,
              value: { jsonValue: '{"preview":true}' },
            },
          ],
        },
      ],
    },
  };
}

function mockSelectedSchema(page: Page) {
  return mockRpcWith(page, "GetSchema", ({ name }) => ({
    schema: schemaRows.find((row) => row.name === name) ?? schemaRows[0],
  }));
}

function mockSelectedTable(page: Page) {
  return mockRpcResponse(page, "GetTable", ({ name }) => {
    const table = [...publicTables, ...billingTables].find(
      (row) => row.name === name
    );
    return table
      ? HttpResponse.json({ table })
      : HttpResponse.json({ code: "not_found" }, { status: HTTP_NOT_FOUND });
  });
}

function mockSelectedView(page: Page) {
  return mockRpcWith(page, "GetView", ({ name }) => ({
    view: {
      comment: "Customers with an active subscription",
      displayName:
        typeof name === "string" ? name.split("/").at(-1) : "active_accounts",
      name,
      owner: "analytics_owner",
      viewType: "VIEW_TYPE_STANDARD",
    },
  }));
}

async function mockExplorerShell(page: Page) {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, [sampleDatabase]);
  await mockDatabaseDetails(page, sampleDatabase);
  await mockRpc(page, "SchemaService/ListSchemas", {
    nextPageToken: "",
    schemas: schemaRows,
  });
  await mockRpc(page, "ListSchemas", {
    nextPageToken: "",
    schemas: schemaRows,
  });
  await mockRpc(page, "ListViews", { nextPageToken: "", views: [] });
  await mockSelectedSchema(page);
  await mockSelectedView(page);
}

async function mockTableCatalog(page: Page) {
  await mockSelectedTable(page);
  await mockRpcWith(page, "ListTables", ({ parent }) => ({
    nextPageToken: "",
    tables:
      typeof parent === "string" && parent.includes("/schemas/billing")
        ? billingTables
        : publicTables,
  }));
  await mockRpc(page, "ListTableColumns", { columns: orderColumns });
  await mockRpc(page, "GetTablePartitionMetadata", {
    partitionMetadata: { childPartitions: [] },
  });
  await mockRpc(page, "ListTableIndexes", { indexes: orderIndexes });
  await mockRpc(page, "ListTableConstraints", {
    constraints: orderConstraints,
  });
  await mockRpc(page, "ListTablePolicies", { policies: orderPolicies });
  await mockRpc(page, "ListTableTriggers", { triggers: orderTriggers });
}

async function mockDefaultReadRows(page: Page) {
  await mockRpc(page, "ReadRows", {
    nextPageToken: "page-2",
    resultSet: {
      ...readRowsResponse().resultSet,
      rows: [
        ...readRowsResponse().resultSet.rows,
        {
          rowKey: "orders/2",
          values: [
            { value: { int64Value: "2" } },
            { value: { stringValue: "grace@example.com" } },
            { value: { jsonValue: '{"preview":false}' } },
          ],
        },
      ],
    },
  });
}

function mockPaginatedReadRows(page: Page) {
  return mockRpcWith(page, "ReadRows", ({ pageToken }) =>
    readRowsResponse({
      nextPageToken:
        typeof pageToken === "string" && pageToken.length > 0 ? "" : "page-2",
      pageToken,
    })
  );
}

async function mockDataExplorerApp(page: Page) {
  await mockExplorerShell(page);
  await mockTableCatalog(page);
  await mockDefaultReadRows(page);
}

export {
  mockDataExplorerApp,
  mockDefaultReadRows,
  mockExplorerShell,
  mockPaginatedReadRows,
  mockTableCatalog,
};
