import { create } from "@bufbuild/protobuf";
import type { TableFilterRule } from "@/features/data-explorer/table-data/filter-state";
import {
  type TableCell,
  TableCellSchema,
  type TableResultColumn,
  TableResultColumnSchema,
  type TableValue,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

// Fixture data for data-grid-scenarios.tsx, shared by rstest behavior tests
// and the Playwright visual harness.

const BYTES_PREVIEW_LENGTH = 4;

function gridColumn(name: string, rawType: string, dataType: DataType) {
  return create(TableResultColumnSchema, {
    columnName: name,
    dataType,
    isNullable: name !== "id",
    mayTruncate: name === "email" || name === "metadata",
    rawType,
  });
}

function gridCell(value: TableValue["kind"], truncated = false) {
  return create(TableCellSchema, {
    fullValueToken: truncated ? "full-value-token" : "",
    truncated,
    value: create(TableValueSchema, { kind: value }),
  });
}

const CUSTOMER_COLUMNS: TableResultColumn[] = [
  gridColumn("id", "uuid", DataType.STRING),
  gridColumn("email", "text", DataType.STRING),
  gridColumn("metadata", "jsonb", DataType.JSON),
  gridColumn("active", "bool", DataType.BOOLEAN),
  gridColumn("last_seen_at", "timestamptz", DataType.TIMESTAMP),
];

const SORTABLE_COLUMNS: TableResultColumn[] = [
  gridColumn("stat_date", "date", DataType.DATE),
  gridColumn("new_customers", "integer", DataType.INTEGER),
  gridColumn("page_views", "integer", DataType.INTEGER),
  gridColumn("total_revenue", "numeric", DataType.FLOAT),
  gridColumn("total_orders", "integer", DataType.INTEGER),
];

const ENTERPRISE_FILTER_RULES: TableFilterRule[] = [
  {
    column: "email",
    id: "filter-email-enterprise",
    operator: "ilike",
    value: "%@enterprise%",
  },
  {
    column: "active",
    id: "filter-active-true",
    operator: "eq",
    value: "true",
  },
];

const NEGATED_REGEX_FILTER_RULES: TableFilterRule[] = [
  {
    column: "email",
    id: "filter-email-support",
    negated: true,
    operator: "imatch",
    value: "^support@",
  },
];

const CUSTOMER_RECORD_CELLS = new Map<string, TableCell | undefined>([
  ["id", gridCell({ case: "stringValue", value: "cst_0000000001" })],
  [
    "email",
    gridCell(
      {
        case: "stringValue",
        value: "alexandra.long.email.alias@enterprise-customer.example.com",
      },
      true
    ),
  ],
  [
    "metadata",
    gridCell({ case: "jsonValue", value: '{"tier":"enterprise","seats":250}' }),
  ],
  ["active", gridCell({ case: "boolValue", value: true })],
  [
    "last_seen_at",
    gridCell({ case: "timestampValue", value: "2026-05-20T11:30:00Z" }),
  ],
]);

const DIALOG_GUARD_METADATA_COLUMN = gridColumn(
  "metadata",
  "jsonb",
  DataType.JSON
);
const DIALOG_GUARD_TAGS_COLUMN = gridColumn("tags", "text[]", DataType.ARRAY);
const DIALOG_GUARD_METADATA_CELL = gridCell({
  case: "jsonValue",
  value:
    '{"color":"blue","hazmat":false,"dimensions":{"depth":2,"height":2,"width":2}}',
});
const DIALOG_GUARD_TAGS_CELL = gridCell({
  case: "stringValue",
  value: "{demo,querylane,product,tag-1}",
});

const CELL_GALLERY_EXAMPLES: Array<{
  cell: TableCell;
  column: TableResultColumn;
}> = [
  {
    cell: create(TableCellSchema, {
      truncated: true,
      value: create(TableValueSchema, {
        kind: {
          case: "stringValue",
          value: "customer@example.com with a very long preview value",
        },
      }),
    }),
    dataType: DataType.STRING,
    name: "Text",
  },
  {
    cell: gridCell({ case: "int64Value", value: 123_456_789n }),
    dataType: DataType.INTEGER,
    name: "Integer",
  },
  {
    cell: gridCell({ case: "numericValue", value: "98123.45001" }),
    dataType: DataType.FLOAT,
    name: "Numeric",
  },
  {
    cell: gridCell({ case: "boolValue", value: true }),
    dataType: DataType.BOOLEAN,
    name: "Boolean",
  },
  {
    cell: create(TableCellSchema, {
      truncated: true,
      value: create(TableValueSchema, {
        kind: {
          case: "jsonValue",
          value: '{"plan":"enterprise","active":true}',
        },
      }),
    }),
    dataType: DataType.JSON,
    name: "JSON",
  },
  {
    cell: create(TableCellSchema, {
      fullSizeBytes: 4096n,
      truncated: true,
      value: create(TableValueSchema, {
        kind: {
          case: "bytesValue",
          value: Uint8Array.from(
            { length: BYTES_PREVIEW_LENGTH },
            (_, index) => index + 1
          ),
        },
      }),
    }),
    dataType: DataType.BINARY,
    name: "Bytes",
  },
  {
    cell: gridCell({ case: "timestampValue", value: "2026-05-20T11:45:00Z" }),
    dataType: DataType.TIMESTAMP,
    name: "Timestamp",
  },
  {
    cell: gridCell({ case: "timestampValue", value: "2026-05-20" }),
    dataType: DataType.DATE,
    name: "Date",
  },
  {
    cell: gridCell({ case: "nullValue", value: 0 }),
    dataType: DataType.STRING,
    name: "Null",
  },
].map(({ cell, dataType, name }) => ({
  cell,
  column: create(TableResultColumnSchema, {
    columnName: name,
    dataType,
    isNullable: true,
    mayTruncate: true,
    rawType: DataType[dataType]?.toLowerCase() ?? "unknown",
  }),
}));

interface DataTableFixtureRow {
  name: string;
  owner: string;
  status: "connected" | "error";
}

const DATA_TABLE_ROWS: DataTableFixtureRow[] = [
  { name: "analytics", owner: "data_team", status: "connected" },
  { name: "audit", owner: "security", status: "connected" },
  { name: "warehouse", owner: "platform", status: "error" },
  { name: "staging", owner: "platform", status: "connected" },
  { name: "billing", owner: "finance", status: "error" },
];

export type { DataTableFixtureRow };
export {
  CELL_GALLERY_EXAMPLES,
  CUSTOMER_COLUMNS,
  CUSTOMER_RECORD_CELLS,
  DATA_TABLE_ROWS,
  DIALOG_GUARD_METADATA_CELL,
  DIALOG_GUARD_METADATA_COLUMN,
  DIALOG_GUARD_TAGS_CELL,
  DIALOG_GUARD_TAGS_COLUMN,
  ENTERPRISE_FILTER_RULES,
  gridCell,
  gridColumn,
  NEGATED_REGEX_FILTER_RULES,
  SORTABLE_COLUMNS,
};
