import type { Page, Route } from "playwright/test";
import {
  mockExplorerShell,
  mockTableCatalog,
  ORDERS_TABLE_NAME,
} from "../tests/data-explorer-fixtures";
import { fulfillJson, mockRpc, mockRpcWith } from "../tests/helpers";

// Data explorer fixtures for data grid visuals: the public.orders table gains
// a customer_id foreign key so the grid renders reference popovers, and page
// two can fail with INSTANCE_UNAVAILABLE to show stale rows.

const DATA_GRID_TABLE_URL = `/instances/production/databases/appdb/explorer?${new URLSearchParams(
  { category: "tables", name: "orders", schema: "public" }
)}`;
const CUSTOMERS_TABLE_NAME =
  "instances/production/databases/appdb/schemas/public/tables/customers";
const LONG_SCHEMA_SUFFIX_LENGTH = 56;
const LONG_SCHEMA_NAME = `schema_${"x".repeat(LONG_SCHEMA_SUFFIX_LENGTH)}`;
const LONG_SCHEMA_CUSTOMERS_TABLE_NAME = `instances/production/databases/appdb/schemas/${LONG_SCHEMA_NAME}/tables/customers`;
const HTTP_SERVICE_UNAVAILABLE = 503;
// Protobuf wire tags for ErrorInfo.reason (field 1) and ErrorInfo.domain
// (field 2), both length-delimited strings.
const ERROR_INFO_REASON_TAG = 0x0a;
const ERROR_INFO_DOMAIN_TAG = 0x12;

interface GridColumnJson {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey?: boolean;
  rawType: string;
}

interface GridRowJson {
  rowKey: string;
  values: Array<{ value: Record<string, string> }>;
}

interface ReadRowsRequestJson {
  name?: unknown;
  pageToken?: unknown;
}

function isReadRowsRequest(value: unknown): value is ReadRowsRequestJson {
  return typeof value === "object" && value !== null;
}

const ORDER_GRID_COLUMNS: GridColumnJson[] = [
  {
    columnName: "id",
    dataType: "DATA_TYPE_INTEGER",
    isNullable: false,
    isPrimaryKey: true,
    rawType: "integer",
  },
  {
    columnName: "customer_id",
    dataType: "DATA_TYPE_INTEGER",
    isNullable: false,
    rawType: "integer",
  },
  {
    columnName: "status",
    dataType: "DATA_TYPE_STRING",
    isNullable: false,
    rawType: "order_status",
  },
  {
    columnName: "email",
    dataType: "DATA_TYPE_STRING",
    isNullable: false,
    rawType: "text",
  },
  {
    columnName: "placed_at",
    dataType: "DATA_TYPE_TIMESTAMP",
    isNullable: false,
    rawType: "timestamptz",
  },
];

const CUSTOMER_GRID_COLUMNS: GridColumnJson[] = [
  {
    columnName: "id",
    dataType: "DATA_TYPE_INTEGER",
    isNullable: false,
    isPrimaryKey: true,
    rawType: "int4",
  },
  {
    columnName: "code",
    dataType: "DATA_TYPE_STRING",
    isNullable: false,
    rawType: "text",
  },
  {
    columnName: "name",
    dataType: "DATA_TYPE_STRING",
    isNullable: false,
    rawType: "text",
  },
];

type OrderRow = [string, string, string, string, string];

const ORDER_ROWS: OrderRow[] = [
  [
    "1001",
    "214",
    "in_transit",
    "arun.patel@example.com",
    "2026-08-12T09:14:00Z",
  ],
  [
    "1002",
    "214",
    "delivered",
    "maria.chen@example.com",
    "2026-08-12T09:12:00Z",
  ],
  ["1003", "215", "pending", "li.wei@example.com", "2026-08-11T17:40:00Z"],
];

function resultSet(columns: GridColumnJson[], rows: GridRowJson[]) {
  return {
    columns,
    observedAt: "2026-08-12T09:15:00Z",
    paginationStrategy: "PAGINATION_STRATEGY_KEYSET",
    rowCount: { status: "STATUS_AVAILABLE", value: String(rows.length) },
    rowIdentity: { columnNames: ["id"], source: "SOURCE_PRIMARY_KEY" },
    rows,
  };
}

function orderRows(): GridRowJson[] {
  return ORDER_ROWS.map(([id, customerId, status, email, placedAt]) => ({
    rowKey: `orders/${id}`,
    values: [
      { value: { int64Value: id } },
      { value: { int64Value: customerId } },
      { value: { stringValue: status } },
      { value: { stringValue: email } },
      { value: { timestampValue: placedAt } },
    ],
  }));
}

function customerRows(): GridRowJson[] {
  return [
    {
      rowKey: "customers/214",
      values: [
        { value: { int64Value: "214" } },
        { value: { stringValue: "HCL" } },
        { value: { stringValue: "Hanse Container Line" } },
      ],
    },
  ];
}

// google.rpc.ErrorInfo { reason: "INSTANCE_UNAVAILABLE", domain: "console.querylane.dev" }
function instanceUnavailableErrorInfo() {
  const reason = Buffer.from("INSTANCE_UNAVAILABLE");
  const domain = Buffer.from("console.querylane.dev");
  return Buffer.concat([
    Buffer.from([ERROR_INFO_REASON_TAG, reason.length]),
    reason,
    Buffer.from([ERROR_INFO_DOMAIN_TAG, domain.length]),
    domain,
  ]).toString("base64");
}

async function fulfillInstanceUnavailable(route: Route) {
  await fulfillJson(
    route,
    {
      code: "unavailable",
      details: [
        {
          debug: {
            domain: "console.querylane.dev",
            reason: "INSTANCE_UNAVAILABLE",
          },
          type: "google.rpc.ErrorInfo",
          value: instanceUnavailableErrorInfo(),
        },
      ],
      message: "PostgreSQL instance is unavailable",
    },
    HTTP_SERVICE_UNAVAILABLE
  );
}

interface DataGridExplorerOptions {
  /** Answer every ReadRows call that carries a page token with INSTANCE_UNAVAILABLE. */
  failNextPage?: boolean;
  /** Table the customer_id foreign key points at. */
  referencedTableName?: string;
}

async function mockDataGridExplorer(
  page: Page,
  {
    failNextPage = false,
    referencedTableName = CUSTOMERS_TABLE_NAME,
  }: DataGridExplorerOptions = {}
) {
  await mockExplorerShell(page);
  await mockTableCatalog(page);
  await mockRpcWith(page, "ListTableColumns", (request) => ({
    columns:
      request["parent"] === ORDERS_TABLE_NAME
        ? ORDER_GRID_COLUMNS
        : CUSTOMER_GRID_COLUMNS,
  }));
  await mockRpc(page, "ListTableConstraints", {
    constraints: [
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
        referencedTable: referencedTableName,
        type: "CONSTRAINT_TYPE_FOREIGN_KEY",
      },
    ],
  });

  async function handleReadRows(route: Route) {
    const request: unknown = route.request().postDataJSON();
    const body = isReadRowsRequest(request) ? request : {};
    if (body.name !== ORDERS_TABLE_NAME) {
      await fulfillJson(route, {
        nextPageToken: "",
        resultSet: resultSet(CUSTOMER_GRID_COLUMNS, customerRows()),
      });
      return;
    }
    if (failNextPage && body.pageToken) {
      await fulfillInstanceUnavailable(route);
      return;
    }
    await fulfillJson(route, {
      nextPageToken: failNextPage ? "orders-page-2" : "",
      resultSet: resultSet(ORDER_GRID_COLUMNS, orderRows()),
    });
  }
  await page.route("**/ReadRows", handleReadRows);
  await page.route("**.ReadRows", handleReadRows);
}

export {
  DATA_GRID_TABLE_URL,
  LONG_SCHEMA_CUSTOMERS_TABLE_NAME,
  LONG_SCHEMA_NAME,
  mockDataGridExplorer,
};
