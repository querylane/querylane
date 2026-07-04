import type { Page, Route } from "playwright/test";
import {
  fulfillJson,
  mockApiManagedReadyConsole,
  mockDatabaseDetails,
  mockDatabases,
  mockInstanceCatalog,
  mockInstanceDetails,
  mockReadyOnboarding,
  mockRpc,
  sampleDatabase,
  sampleInstance,
} from "./helpers";

const HTTP_OK = 200;
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
  const rowId = pageToken ? "2" : "1";
  const rowEmail = pageToken ? "grace@example.com" : email;

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

async function fulfillTableList(route: Route) {
  const body = route.request().postDataJSON();
  const parent = String(body.parent ?? "");
  await fulfillJson(route, {
    nextPageToken: "",
    tables: parent.includes("/schemas/billing") ? billingTables : publicTables,
  });
}

async function mockSelectedSchema(page: Page) {
  await page.route("**/GetSchema", async (route) => {
    const body = route.request().postDataJSON();
    const name = String(body.name ?? "");
    const schema = schemaRows.find((row) => row.name === name) ?? schemaRows[0];
    await fulfillJson(route, { schema });
  });
  await page.route("**.GetSchema", async (route) => {
    const body = route.request().postDataJSON();
    const name = String(body.name ?? "");
    const schema = schemaRows.find((row) => row.name === name) ?? schemaRows[0];
    await fulfillJson(route, { schema });
  });
}

async function mockSelectedTable(page: Page) {
  await page.route("**/GetTable", async (route) => {
    const body = route.request().postDataJSON();
    const name = String(body.name ?? "");
    const table = [...publicTables, ...billingTables].find(
      (row) => row.name === name
    );
    await fulfillJson(
      route,
      table ? { table } : { code: "not_found" },
      table ? HTTP_OK : HTTP_NOT_FOUND
    );
  });
  await page.route("**.GetTable", async (route) => {
    const body = route.request().postDataJSON();
    const name = String(body.name ?? "");
    const table = [...publicTables, ...billingTables].find(
      (row) => row.name === name
    );
    await fulfillJson(
      route,
      table ? { table } : { code: "not_found" },
      table ? HTTP_OK : HTTP_NOT_FOUND
    );
  });
}

async function mockSelectedView(page: Page) {
  await page.route("**/GetView", async (route) => {
    const body = route.request().postDataJSON();
    const name = String(body.name ?? "");
    await fulfillJson(route, {
      view: {
        comment: "Customers with an active subscription",
        displayName: name.split("/").at(-1) ?? "active_accounts",
        name,
        owner: "analytics_owner",
        viewType: "VIEW_TYPE_STANDARD",
      },
    });
  });
  await page.route("**.GetView", async (route) => {
    const body = route.request().postDataJSON();
    const name = String(body.name ?? "");
    await fulfillJson(route, {
      view: {
        comment: "Customers with an active subscription",
        displayName: name.split("/").at(-1) ?? "active_accounts",
        name,
        owner: "analytics_owner",
        viewType: "VIEW_TYPE_STANDARD",
      },
    });
  });
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
  await page.route("**/ListTables", (route) => fulfillTableList(route));
  await page.route("**.ListTables", (route) => fulfillTableList(route));
  await mockRpc(page, "ListTableColumns", { columns: orderColumns });
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

async function mockReadRowsWithObserver(
  page: Page,
  onBody: (body: Record<string, unknown>) => void
) {
  await page.route("**/ReadRows", async (route) => {
    const body = route.request().postDataJSON();
    onBody(body);
    await fulfillJson(
      route,
      readRowsResponse({ nextPageToken: "", rowCount: "2" })
    );
  });
  await page.route("**.ReadRows", async (route) => {
    const body = route.request().postDataJSON();
    onBody(body);
    await fulfillJson(
      route,
      readRowsResponse({ nextPageToken: "", rowCount: "2" })
    );
  });
}

async function mockPaginatedReadRows(
  page: Page,
  onBody: (body: Record<string, unknown>) => void
) {
  await page.route("**/ReadRows", async (route) => {
    const body = route.request().postDataJSON();
    onBody(body);
    await fulfillJson(
      route,
      readRowsResponse({
        nextPageToken: body.pageToken ? "" : "page-2",
        pageToken: body.pageToken,
      })
    );
  });
  await page.route("**.ReadRows", async (route) => {
    const body = route.request().postDataJSON();
    onBody(body);
    await fulfillJson(
      route,
      readRowsResponse({
        nextPageToken: body.pageToken ? "" : "page-2",
        pageToken: body.pageToken,
      })
    );
  });
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
  mockReadRowsWithObserver,
  mockTableCatalog,
  ORDERS_TABLE_NAME,
  orderColumns,
};
