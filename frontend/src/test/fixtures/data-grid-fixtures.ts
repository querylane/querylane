import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError, type ServiceImpl } from "@connectrpc/connect";
import { ErrorInfoSchema } from "../../protogen/google/rpc/error_details_pb";
import {
  PaginationStrategy,
  ReadRowsResponseSchema,
  RowCount_Status,
  type TableCellSchema,
  type TableDataService,
  type TableResultRowSchema,
} from "../../protogen/querylane/console/v1alpha1/table_data_pb";
import {
  ConstraintType,
  DataType,
  ListTableColumnsResponseSchema,
  ListTableConstraintsResponseSchema,
  RowIdentity_Source,
  type TableService,
} from "../../protogen/querylane/console/v1alpha1/table_pb";

// One source of data grid rows for rstest (createTestRouterTransport) and
// Playwright (serveService). public.orders carries a customer_id foreign key
// into public.customers so the grid renders reference popovers; `failNextPage`
// answers every paged ReadRows with INSTANCE_UNAVAILABLE to show stale rows.
// Relative imports keep this module loadable from Playwright specs.

const DATA_GRID_TABLE_PREFIX = "instances/production/databases/appdb/schemas";
const ORDERS_TABLE_NAME = `${DATA_GRID_TABLE_PREFIX}/public/tables/orders`;
const CUSTOMERS_TABLE_NAME = `${DATA_GRID_TABLE_PREFIX}/public/tables/customers`;

/** Fits both `Column` (ListTableColumns) and `TableResultColumn` (ReadRows). */
interface GridColumn {
  columnName: string;
  dataType: DataType;
  isPrimaryKey?: boolean;
  rawType: string;
}
type CellInit = MessageInitShape<typeof TableCellSchema>;
type RowInit = MessageInitShape<typeof TableResultRowSchema>;

const ORDER_COLUMNS: GridColumn[] = [
  {
    columnName: "id",
    dataType: DataType.INTEGER,
    isPrimaryKey: true,
    rawType: "integer",
  },
  { columnName: "customer_id", dataType: DataType.INTEGER, rawType: "integer" },
  { columnName: "status", dataType: DataType.STRING, rawType: "order_status" },
  { columnName: "email", dataType: DataType.STRING, rawType: "text" },
  {
    columnName: "placed_at",
    dataType: DataType.TIMESTAMP,
    rawType: "timestamptz",
  },
];

const CUSTOMER_COLUMNS: GridColumn[] = [
  {
    columnName: "id",
    dataType: DataType.INTEGER,
    isPrimaryKey: true,
    rawType: "int4",
  },
  { columnName: "code", dataType: DataType.STRING, rawType: "text" },
  { columnName: "name", dataType: DataType.STRING, rawType: "text" },
];

const ORDER_ROWS = [
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
] as const;

interface DataGridFixture {
  /** Answer every ReadRows call that carries a page token with INSTANCE_UNAVAILABLE. */
  failNextPage?: boolean;
  /** Pads public.orders past its three named rows, for scrolling cases. */
  orderRowCount?: number;
  /** Table the customer_id foreign key points at. */
  referencedTableName?: string;
}

function text(value: string): CellInit {
  return { value: { kind: { case: "stringValue", value } } };
}

function integer(value: string): CellInit {
  return { value: { kind: { case: "int64Value", value: BigInt(value) } } };
}

function orderRow(index: number): RowInit {
  const [id, customerId, status, email, placedAt] = ORDER_ROWS[index] ?? [
    String(index + 1),
    "214",
    "pending",
    `customer.${index + 1}@example.com`,
    "2026-08-11T12:00:00Z",
  ];
  return {
    rowKey: `orders/${id}`,
    values: [
      integer(id),
      integer(customerId),
      text(status),
      text(email),
      { value: { kind: { case: "timestampValue", value: placedAt } } },
    ],
  };
}

function readRowsResponse(
  columns: GridColumn[],
  rows: RowInit[],
  nextPageToken = ""
) {
  return create(ReadRowsResponseSchema, {
    nextPageToken,
    resultSet: {
      columns: columns.map(({ columnName, dataType, rawType }) => ({
        columnName,
        dataType,
        rawType,
      })),
      observedAt: timestampFromDate(new Date("2026-08-12T09:15:00Z")),
      paginationStrategy: PaginationStrategy.KEYSET,
      rowCount: {
        status: RowCount_Status.AVAILABLE,
        value: BigInt(rows.length),
      },
      rowIdentity: {
        columnNames: ["id"],
        source: RowIdentity_Source.PRIMARY_KEY,
      },
      rows,
    },
  });
}

function instanceUnavailable() {
  return new ConnectError(
    "PostgreSQL instance is unavailable",
    Code.Unavailable,
    undefined,
    [
      {
        desc: ErrorInfoSchema,
        value: {
          domain: "console.querylane.dev",
          reason: "INSTANCE_UNAVAILABLE",
        },
      },
    ]
  );
}

/**
 * Connect service implementations for the data grid route. Pass them to
 * `createTestRouterTransport` in rstest or `serveService` in Playwright.
 */
function dataGridFixtureServices({
  failNextPage = false,
  orderRowCount = ORDER_ROWS.length,
  referencedTableName = CUSTOMERS_TABLE_NAME,
}: DataGridFixture = {}) {
  const tableService: Partial<ServiceImpl<typeof TableService>> = {
    listTableColumns: ({ parent }) =>
      create(ListTableColumnsResponseSchema, {
        columns:
          parent === ORDERS_TABLE_NAME ? ORDER_COLUMNS : CUSTOMER_COLUMNS,
      }),
    listTableConstraints: () =>
      create(ListTableConstraintsResponseSchema, {
        constraints: [
          {
            columnNames: ["id"],
            constraintName: "orders_pkey",
            definition: "PRIMARY KEY (id)",
            type: ConstraintType.PRIMARY_KEY,
          },
          {
            columnNames: ["customer_id"],
            constraintName: "orders_customer_id_fkey",
            definition: "FOREIGN KEY (customer_id) REFERENCES customers(id)",
            referencedColumnNames: ["id"],
            referencedTable: referencedTableName,
            type: ConstraintType.FOREIGN_KEY,
          },
        ],
      }),
  };
  const tableDataService: Partial<ServiceImpl<typeof TableDataService>> = {
    readRows: ({ name, pageToken }) => {
      if (name !== ORDERS_TABLE_NAME) {
        return readRowsResponse(CUSTOMER_COLUMNS, [
          {
            rowKey: "customers/214",
            values: [integer("214"), text("HCL"), text("Hanse Container Line")],
          },
        ]);
      }
      if (failNextPage && pageToken) {
        throw instanceUnavailable();
      }
      return readRowsResponse(
        ORDER_COLUMNS,
        Array.from({ length: orderRowCount }, (_, index) => orderRow(index)),
        failNextPage ? "orders-page-2" : ""
      );
    },
  };
  return { table: tableService, tableData: tableDataService };
}

export type { DataGridFixture };
export { CUSTOMERS_TABLE_NAME, dataGridFixtureServices, ORDERS_TABLE_NAME };
