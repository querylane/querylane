import { create, toBinary } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GridRow } from "@/components/data-grid/table-data-grid/grid-row-model";
import { ROW_KEY_FIELD } from "@/components/data-grid/table-data-grid/grid-row-model";
import { TableDetail } from "@/features/data-explorer/explorer-table-detail";
import { PostgreSqlErrorDetailSchema } from "@/protogen/querylane/console/v1alpha1/errors_pb";
import {
  ReadRowsResponseSchema,
  RowCount_Status,
  RowCountSchema,
  TableResultSetSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import {
  GetTablePartitionMetadataResponseSchema,
  ListTableColumnsResponseSchema,
  ListTableConstraintsResponseSchema,
  ListTableIndexesResponseSchema,
  ListTablePoliciesResponseSchema,
  ListTableTriggersResponseSchema,
  TableSchema,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

const POSTGRES_DETAIL_TYPE = "querylane.console.v1alpha1.PostgreSqlErrorDetail";
const COLUMNS_TAB_RE = /^Columns/;
const INDEXES_TAB_RE = /^Indexes/;

interface MockGridColumn {
  key: string;
  renderCell?: (args: { row: GridRow; rowIdx: number }) => ReactNode;
  renderHeaderCell?: () => ReactNode;
}

interface MockGridProps {
  columns?: MockGridColumn[];
  rows?: GridRow[];
}

const tableQueries = vi.hoisted(() => ({
  columns: {
    data: undefined as unknown,
    dataUpdatedAt: 0,
    error: null as Error | null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(() => Promise.resolve()),
  },
  constraints: {
    data: undefined as unknown,
    dataUpdatedAt: 0,
    error: null as Error | null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(() => Promise.resolve()),
  },
  indexes: {
    data: undefined as unknown,
    dataUpdatedAt: 0,
    error: null as Error | null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(() => Promise.resolve()),
  },
  partitionMetadata: {
    data: undefined as unknown,
    dataUpdatedAt: 0,
    error: null as Error | null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(() => Promise.resolve()),
  },
  policies: {
    data: undefined as unknown,
    dataUpdatedAt: 0,
    error: null as Error | null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(() => Promise.resolve()),
  },
  triggers: {
    data: undefined as unknown,
    dataUpdatedAt: 0,
    error: null as Error | null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(() => Promise.resolve()),
  },
}));

const tableDataApi = vi.hoisted(() => ({
  useReadCellValueMutation: vi.fn(),
  useReadRowsQuery: vi.fn(),
  useStreamRowsExporter: vi.fn(),
}));

const reactDataGrid = vi.hoisted(() => ({
  dataGrid: vi.fn((props: MockGridProps) => (
    <div data-testid="data-grid">
      {props.rows?.map((row, rowIndex) => (
        <div key={row[ROW_KEY_FIELD]}>
          {props.columns?.map((column) => (
            <div data-testid={`grid-cell-${column.key}`} key={column.key}>
              {column.renderCell?.({ row, rowIdx: rowIndex })}
            </div>
          ))}
        </div>
      ))}
    </div>
  )),
}));

vi.mock("react-data-grid", () => ({
  ...Object.fromEntries([
    ["DataGrid", reactDataGrid.dataGrid],
    ["SelectColumn", { columnName: "", key: "__select" }],
  ]),
  SELECT_COLUMN_KEY: "__select",
}));

vi.mock("@/hooks/api/table", () => ({
  useGetTablePartitionMetadataQuery: () => tableQueries.partitionMetadata,
  useListTableColumnsQuery: () => tableQueries.columns,
  useListTableConstraintsQuery: () => tableQueries.constraints,
  useListTableIndexesQuery: () => tableQueries.indexes,
  useListTablePoliciesQuery: () => tableQueries.policies,
  useListTableTriggersQuery: () => tableQueries.triggers,
}));

vi.mock("@/hooks/api/table-data", () => ({
  useReadCellValueMutation: tableDataApi.useReadCellValueMutation,
  useReadRowsQuery: tableDataApi.useReadRowsQuery,
  useStreamRowsExporter: tableDataApi.useStreamRowsExporter,
}));

function seedSuccessfulMetadataQueries() {
  tableQueries.columns.data = create(ListTableColumnsResponseSchema, {
    columns: [],
  });
  tableQueries.columns.error = null;
  tableQueries.constraints.data = create(ListTableConstraintsResponseSchema, {
    constraints: [],
  });
  tableQueries.constraints.error = null;
  tableQueries.indexes.data = create(ListTableIndexesResponseSchema, {
    indexes: [],
  });
  tableQueries.indexes.error = null;
  tableQueries.partitionMetadata.data = create(
    GetTablePartitionMetadataResponseSchema,
    {}
  );
  tableQueries.partitionMetadata.error = null;
  tableQueries.policies.data = create(ListTablePoliciesResponseSchema, {
    policies: [],
  });
  tableQueries.policies.error = null;
  tableQueries.triggers.data = create(ListTableTriggersResponseSchema, {
    triggers: [],
  });
  tableQueries.triggers.error = null;
  tableDataApi.useReadRowsQuery.mockReturnValue({
    data: create(ReadRowsResponseSchema, {
      resultSet: create(TableResultSetSchema, {
        columns: [],
        rows: [],
      }),
    }),
    error: null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  });
  tableDataApi.useReadCellValueMutation.mockReturnValue({
    isError: false,
    isPending: false,
    mutate: vi.fn(),
  });
  tableDataApi.useStreamRowsExporter.mockReturnValue(vi.fn());
}

function createMetadataError({
  code,
  conditionName,
  message,
  operation,
  reason,
  sqlstate,
  sqlstateClass,
}: {
  code: Code;
  conditionName: string;
  message: string;
  operation: string;
  reason: string;
  sqlstate: string;
  sqlstateClass: string;
}) {
  const error = new ConnectError(
    `PostgreSQL ${conditionName} during ${operation}: ${message}`,
    code
  );
  error.details = [
    {
      debug: {
        domain: "console.querylane.dev",
        metadata: {
          conditionName,
          operation,
          sqlstate,
          sqlstateClass,
        },
        reason,
      },
      type: "google.rpc.ErrorInfo",
      value: new Uint8Array([1]),
    },
    {
      type: POSTGRES_DETAIL_TYPE,
      value: toBinary(
        PostgreSqlErrorDetailSchema,
        create(PostgreSqlErrorDetailSchema, {
          conditionName,
          operation,
          sqlstate,
          sqlstateClass,
        })
      ),
    },
  ];
  return error;
}

beforeEach(() => {
  seedSuccessfulMetadataQueries();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TableDetail data tab toolbar", () => {
  it("moves the estimated row count into the header rows stat", () => {
    tableDataApi.useReadRowsQuery.mockReturnValue({
      data: create(ReadRowsResponseSchema, {
        resultSet: create(TableResultSetSchema, {
          columns: [],
          rowCount: create(RowCountSchema, {
            status: RowCount_Status.ESTIMATED,
            value: 72_000n,
          }),
          rows: [],
        }),
      }),
      dataUpdatedAt: Date.UTC(2026, 5, 14, 10, 30, 15),
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(
      <TableDetail
        databaseId="app"
        instanceId="prod"
        schemaName="commerce"
        table={create(TableSchema, { rowCount: 72_000n, sizeBytes: 4096n })}
        tableName="order_event_2026_h1"
      />
    );

    expect(screen.getByText("≈72k")).toBeTruthy();
    expect(screen.queryByText("≈72,000 rows")).toBeNull();
  });

  it("honors URL-backed metadata tabs and reports tab changes", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();

    render(
      <TableDetail
        databaseId="app"
        initialTab="columns"
        instanceId="prod"
        onTabChange={onTabChange}
        schemaName="commerce"
        table={create(TableSchema, { rowCount: 72_000n, sizeBytes: 4096n })}
        tableName="order_event_2026_h1"
      />
    );

    expect(
      screen
        .getByRole("tab", { name: COLUMNS_TAB_RE })
        .hasAttribute("data-active")
    ).toBe(true);

    await user.click(screen.getByRole("tab", { name: INDEXES_TAB_RE }));

    expect(onTabChange).toHaveBeenCalledWith("indexes");
  });
});

describe("TableDetail metadata errors", () => {
  it("renders SQLSTATE-aware tab errors with retry and copyable details", async () => {
    const user = userEvent.setup();
    tableQueries.indexes.error = createMetadataError({
      code: Code.PermissionDenied,
      conditionName: "insufficient_privilege",
      message: "missing index access",
      operation: "list_indexes",
      reason: "PERMISSION_DENIED",
      sqlstate: "42501",
      sqlstateClass: "42",
    });
    tableQueries.indexes.data = undefined;

    render(
      <TableDetail
        databaseId="app"
        initialTab="indexes"
        instanceId="prod"
        schemaName="public"
        table={create(TableSchema, { rowCount: 12n, sizeBytes: 4096n })}
        tableName="customers"
      />
    );

    expect(screen.getByText("PostgreSQL permission denied")).toBeTruthy();
    expect(
      screen.getByText("Retry after checking the role or grants.")
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Error details" }));

    expect(screen.getByText("Code: PermissionDenied")).toBeTruthy();
    expect(screen.getByText("SQLSTATE: 42501")).toBeTruthy();
    expect(screen.getByText("Condition: insufficient_privilege")).toBeTruthy();
    expect(screen.getByText("Endpoint: ListTableIndexes")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy details" })).toBeTruthy();
  });

  it("renders every failed metadata query with real RPC endpoints", async () => {
    const user = userEvent.setup();
    tableQueries.constraints.error = createMetadataError({
      code: Code.PermissionDenied,
      conditionName: "insufficient_privilege",
      message: "missing constraint access",
      operation: "list_constraints",
      reason: "PERMISSION_DENIED",
      sqlstate: "42501",
      sqlstateClass: "42",
    });
    tableQueries.constraints.data = undefined;
    tableQueries.indexes.error = createMetadataError({
      code: Code.Unavailable,
      conditionName: "cannot_connect_now",
      message: "server unavailable",
      operation: "list_indexes",
      reason: "UNAVAILABLE",
      sqlstate: "57P03",
      sqlstateClass: "57",
    });
    tableQueries.indexes.data = undefined;

    render(
      <TableDetail
        databaseId="app"
        initialTab="columns"
        instanceId="prod"
        schemaName="public"
        table={create(TableSchema, { rowCount: 12n, sizeBytes: 4096n })}
        tableName="customers"
      />
    );

    const detailButtons = screen.getAllByRole("button", {
      name: "Error details",
    });
    expect(detailButtons).toHaveLength(2);

    const endpoints = new Set<string>();
    for (const detailButton of detailButtons) {
      await user.click(detailButton);
      for (const endpoint of ["ListTableConstraints", "ListTableIndexes"]) {
        if (screen.queryByText(`Endpoint: ${endpoint}`)) {
          endpoints.add(endpoint);
        }
      }
      expect(screen.queryByText("Endpoint: TableDetail/columns")).toBeNull();
      await user.keyboard("{Escape}");
    }
    expect(endpoints).toEqual(
      new Set(["ListTableConstraints", "ListTableIndexes"])
    );
  });
});
