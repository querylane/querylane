import { create, toBinary } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  type ClipboardEvent as ReactClipboardEvent,
  type ReactNode,
  StrictMode,
} from "react";
import type { DefaultColumnOptions, Renderers } from "react-data-grid";
import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";
import {
  EXPAND_COLUMN_KEY,
  fallbackRowKey,
  type GridRow,
  ROW_KEY_FIELD,
} from "@/components/data-grid/table-data-grid/grid-row-model";
import { TableDataGrid } from "@/components/data-grid/table-data-grid/table-data-grid";
import { useRefreshSettingsStore } from "@/features/user-settings/refresh-settings";
import { useTableColumnLayoutSettingsStore } from "@/features/user-settings/table-column-layout-settings";
import {
  PostgreSqlErrorDetailSchema,
  PostgreSqlErrorKind,
  PostgreSqlErrorRetryGuidance,
} from "@/protogen/querylane/console/v1alpha1/errors_pb";
import {
  ReadRowsResponseSchema,
  RowPredicate_Operator,
  TableCellSchema,
  TableResultColumnSchema,
  TableResultRowSchema,
  TableResultSetSchema,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import {
  ColumnSchema,
  DataType,
  ListTableColumnsResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

const RETRY_BUTTON_RE = /retry/i;
const LAST_FETCHED_RE = /Last fetched/;
const FILTER_BUTTON_RE = /Filter/;
const DELETE_BUTTON_RE = /delete/i;
const EDIT_BUTTON_RE = /edit/i;
const POSTGRES_DETAIL_TYPE = "querylane.console.v1alpha1.PostgreSqlErrorDetail";

const tableApi = vi.hoisted(() => ({
  useListTableColumnsQuery: vi.fn(),
}));

const tableDataApi = vi.hoisted(() => ({
  useReadCellValueMutation: vi.fn(),
  useReadRowsQuery: vi.fn(),
  useReadRowsQueryActions: vi.fn(() => ({
    fetch: vi.fn(() => Promise.resolve()),
    getState: vi.fn(() => ({ fetchStatus: "idle", status: "success" })),
    prefetch: vi.fn(),
  })),
}));

const downloadBlobMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({
  dismiss: vi.fn(),
  error: vi.fn(),
  loading: vi.fn(() => "toast-id"),
  success: vi.fn(),
  warning: vi.fn(),
}));

interface MockGridColumn {
  draggable?: boolean;
  frozen?: boolean;
  key: string;
  renderCell?: (args: { row: GridRow; rowIdx: number }) => ReactNode;
  renderHeaderCell?: () => ReactNode;
}

interface MockGridProps {
  columns?: MockGridColumn[];
  defaultColumnOptions?: DefaultColumnOptions<GridRow, unknown>;
  onActivePositionChange?: (args: {
    column: MockGridColumn | undefined;
    row: GridRow | undefined;
    rowIdx: number;
  }) => void;
  onCellContextMenu?: (
    args: { column: MockGridColumn; row: GridRow; rowIdx: number },
    event: {
      clientX: number;
      clientY: number;
      currentTarget: HTMLDivElement;
      preventDefault: () => void;
      preventGridDefault: () => void;
    }
  ) => void;
  onCellCopy?: (
    args: { column: MockGridColumn; row: GridRow },
    event: ReactClipboardEvent<HTMLDivElement>
  ) => void;
  onColumnsReorder?: (sourceColumnKey: string, targetColumnKey: string) => void;
  onSelectedRowsChange?: (selectedRows: Set<string>) => void;
  renderers?: Renderers<GridRow, unknown>;
  rowKeyGetter?: (row: GridRow) => string;
  rows?: GridRow[];
  selectedRows?: ReadonlySet<string>;
}

const reactDataGrid = vi.hoisted(() => ({
  dataGrid: vi.fn((props: MockGridProps) => (
    <div data-testid="data-grid">
      <div data-testid="data-grid-headers">
        {props.columns?.map((column) => (
          <div data-testid={`grid-header-${column.key}`} key={column.key}>
            {column.renderHeaderCell?.()}
          </div>
        ))}
      </div>
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

// The mocked DataGrid renders plain divs, so context-menu tests invoke the
// grid's onCellContextMenu prop directly instead of dispatching a DOM event.
function openCellContextMenu(
  columnKey: string,
  rowIdx: number,
  currentTarget = document.createElement("div")
) {
  const gridProps = reactDataGrid.dataGrid.mock.lastCall?.[0];
  const row = gridProps?.rows?.[rowIdx];
  if (!(gridProps?.onCellContextMenu && row)) {
    throw new Error("Expected the data grid mock to receive rows");
  }
  act(() => {
    gridProps.onCellContextMenu?.(
      { column: { key: columnKey }, row, rowIdx },
      {
        clientX: 40,
        clientY: 40,
        currentTarget,
        preventDefault: () => undefined,
        preventGridDefault: () => undefined,
      }
    );
  });
}

vi.mock("react-data-grid", () => ({
  ...Object.fromEntries([
    ["DataGrid", reactDataGrid.dataGrid],
    ["SelectColumn", { columnName: "", key: "__select" }],
  ]),
  SELECT_COLUMN_KEY: "__select",
}));

vi.mock("@/hooks/api/table", () => ({
  useListTableColumnsQuery: tableApi.useListTableColumnsQuery,
}));

vi.mock("@/hooks/api/table-data", () => ({
  useReadCellValueMutation: tableDataApi.useReadCellValueMutation,
  useReadRowsQuery: tableDataApi.useReadRowsQuery,
  useReadRowsQueryActions: tableDataApi.useReadRowsQueryActions,
}));

vi.mock("@/lib/download-blob", () => ({
  downloadBlob: downloadBlobMock,
}));

vi.mock("sonner", () => ({ toast: toastMock }));

const writeClipboardMock = vi.hoisted(() => vi.fn());
const writeClipboardDeferredMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/data-grid/table-data-grid/grid-clipboard", () => ({
  writeClipboard: writeClipboardMock,
  writeClipboardDeferred: writeClipboardDeferredMock,
}));

function seedRowsQuery(
  rows: number | readonly { rowKey: string; value: string }[] = 1,
  overrides: {
    dataUpdatedAt?: number;
    isFetching?: boolean;
    isPlaceholderData?: boolean;
    refetch?: () => Promise<unknown>;
  } = {}
) {
  tableApi.useListTableColumnsQuery.mockReturnValue({
    data: create(ListTableColumnsResponseSchema, { columns: [] }),
    error: null,
    isError: false,
  });
  tableDataApi.useReadRowsQuery.mockReturnValue({
    data: create(ReadRowsResponseSchema, {
      resultSet: create(TableResultSetSchema, {
        columns: [
          create(TableResultColumnSchema, {
            columnName: "email",
            dataType: DataType.STRING,
            rawType: "text",
          }),
        ],
        rows: (typeof rows === "number"
          ? Array.from({ length: rows }, (_, index) => ({
              rowKey: `row-${index}`,
              value: `user-${index}`,
            }))
          : rows
        ).map((row) =>
          create(TableResultRowSchema, {
            rowKey: row.rowKey,
            values: [
              create(TableCellSchema, {
                value: create(TableValueSchema, {
                  kind: { case: "stringValue", value: row.value },
                }),
              }),
            ],
          })
        ),
      }),
    }),
    dataUpdatedAt: overrides.dataUpdatedAt ?? 0,
    error: null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
    ...overrides,
  });
  tableDataApi.useReadCellValueMutation.mockReturnValue({
    isError: false,
    isPending: false,
    mutate: vi.fn(),
  });
}

function seedRowsQueryWithRawClipboardValues() {
  tableApi.useListTableColumnsQuery.mockReturnValue({
    data: create(ListTableColumnsResponseSchema, { columns: [] }),
    error: null,
    isError: false,
  });
  tableDataApi.useReadRowsQuery.mockReturnValue({
    data: create(ReadRowsResponseSchema, {
      resultSet: create(TableResultSetSchema, {
        columns: [
          create(TableResultColumnSchema, {
            columnName: "measurement",
            dataType: DataType.FLOAT,
            rawType: "double precision",
          }),
          create(TableResultColumnSchema, {
            columnName: "observed_at",
            dataType: DataType.TIMESTAMP,
            rawType: "timestamptz",
          }),
        ],
        rows: [
          create(TableResultRowSchema, {
            rowKey: "row-0",
            values: [
              create(TableCellSchema, {
                value: create(TableValueSchema, {
                  kind: { case: "doubleValue", value: 1234.567_891_23 },
                }),
              }),
              create(TableCellSchema, {
                value: create(TableValueSchema, {
                  kind: {
                    case: "timestampValue",
                    value: "2024-01-01 12:00:00.123456+00",
                  },
                }),
              }),
            ],
          }),
        ],
      }),
    }),
    dataUpdatedAt: 0,
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
}

function seedRowsQueryWithExpandableValues() {
  tableApi.useListTableColumnsQuery.mockReturnValue({
    data: create(ListTableColumnsResponseSchema, { columns: [] }),
    error: null,
    isError: false,
  });
  tableDataApi.useReadRowsQuery.mockReturnValue({
    data: create(ReadRowsResponseSchema, {
      resultSet: create(TableResultSetSchema, {
        columns: [
          create(TableResultColumnSchema, {
            columnName: "metadata",
            dataType: DataType.JSON,
            rawType: "jsonb",
          }),
          create(TableResultColumnSchema, {
            columnName: "tags",
            dataType: DataType.ARRAY,
            rawType: "text[]",
          }),
        ],
        rows: [
          create(TableResultRowSchema, {
            rowKey: "row-0",
            values: [
              create(TableCellSchema, {
                value: create(TableValueSchema, {
                  kind: {
                    case: "jsonValue",
                    value: '{"tier":"enterprise","seats":250}',
                  },
                }),
              }),
              create(TableCellSchema, {
                value: create(TableValueSchema, {
                  kind: {
                    case: "stringValue",
                    value: "{demo,querylane,product}",
                  },
                }),
              }),
            ],
          }),
        ],
      }),
    }),
    dataUpdatedAt: 0,
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
}

function seedRowsQueryWithTruncatedCell(mutateAsync: ReturnType<typeof vi.fn>) {
  tableApi.useListTableColumnsQuery.mockReturnValue({
    data: create(ListTableColumnsResponseSchema, { columns: [] }),
    error: null,
    isError: false,
  });
  tableDataApi.useReadRowsQuery.mockReturnValue({
    data: create(ReadRowsResponseSchema, {
      resultSet: create(TableResultSetSchema, {
        columns: [
          create(TableResultColumnSchema, {
            columnName: "notes",
            dataType: DataType.STRING,
            mayTruncate: true,
            rawType: "text",
          }),
        ],
        rows: [
          create(TableResultRowSchema, {
            rowKey: "row-0",
            values: [
              create(TableCellSchema, {
                fullSizeBytes: 17n,
                fullValueToken: "token-notes",
                truncated: true,
                value: create(TableValueSchema, {
                  kind: { case: "stringValue", value: "the com" },
                }),
              }),
            ],
          }),
        ],
      }),
    }),
    dataUpdatedAt: 0,
    error: null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  });
  tableDataApi.useReadCellValueMutation.mockReturnValue({
    isError: false,
    isPending: false,
    mutate: vi.fn(),
    mutateAsync,
  });
}

function latestEmailGridColumn() {
  return reactDataGrid.dataGrid.mock.calls
    .at(-1)?.[0]
    ?.columns?.find((column) => column.key === "email");
}

function seedRowsQueryError(error: Error) {
  tableApi.useListTableColumnsQuery.mockReturnValue({
    data: undefined,
    error: null,
    isError: false,
  });
  tableDataApi.useReadRowsQuery.mockReturnValue({
    data: undefined,
    error,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  });
  tableDataApi.useReadCellValueMutation.mockReturnValue({
    isError: false,
    isPending: false,
    mutate: vi.fn(),
  });
}

function createPostgresRowsError() {
  const error = new ConnectError(
    "PostgreSQL query_canceled during read_rows",
    Code.DeadlineExceeded
  );
  error.details = [
    {
      debug: {
        domain: "console.querylane.dev",
        metadata: {
          conditionName: "query_canceled",
          operation: "read_rows",
          sqlstate: "57014",
          sqlstateClass: "57",
        },
        reason: "TIMEOUT",
      },
      type: "google.rpc.ErrorInfo",
      value: new Uint8Array([1]),
    },
    {
      type: POSTGRES_DETAIL_TYPE,
      value: toBinary(
        PostgreSqlErrorDetailSchema,
        create(PostgreSqlErrorDetailSchema, {
          conditionName: "query_canceled",
          kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_TIMEOUT,
          operation: "read_rows",
          retryGuidance:
            PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_LATER,
          sqlstate: "57014",
          sqlstateClass: "57",
        })
      ),
    },
  ];
  return error;
}

function createLiveQueryLimitError() {
  const error = new ConnectError(
    "live query concurrency limit reached",
    Code.ResourceExhausted
  );
  error.details = [
    {
      debug: {
        domain: "console.querylane.dev",
        metadata: { scope: "instance" },
        reason: "LIVE_QUERY_LIMIT_EXCEEDED",
      },
      type: "google.rpc.ErrorInfo",
      value: new Uint8Array([1]),
    },
  ];
  return error;
}

function setupTableDataGridIntegrationTest() {
  // No shared query/mutation state needs seeding beyond the vi.mock defaults.
}

function teardownTableDataGridIntegrationTest() {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  useRefreshSettingsStore.getState().setRefreshIntervalMs(null);
  useTableColumnLayoutSettingsStore.setState({ layouts: {} });
}

describe("TableDataGrid query setup", () => {
  beforeEach(setupTableDataGridIntegrationTest);
  afterEach(teardownTableDataGridIntegrationTest);

  it("disables column validation with a concrete input instead of skipToken", () => {
    const tableName =
      "instances/prod/databases/app/schemas/public/tables/customers";
    seedRowsQuery(0);

    render(<TableDataGrid name={tableName} />);

    expect(tableApi.useListTableColumnsQuery).toHaveBeenCalledWith(
      { parent: tableName },
      expect.objectContaining({ enabled: false })
    );
  });

  it("keeps the column grid mounted when a table has no rows", () => {
    seedRowsQuery(0);

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    // The grid header must stay visible so the table's columns and types
    // remain inspectable; the no-rows message overlays the empty body.
    expect(screen.getByTestId("data-grid")).toBeTruthy();
    expect(
      screen
        .getByText("No rows found")
        .closest('[data-slot="grid-no-rows-overlay"]')
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Rows per page" })
    ).toBeTruthy();
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
  });

  it("gives the virtualized grid a bounded scroll viewport", () => {
    seedRowsQuery(1);

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    expect(reactDataGrid.dataGrid).toHaveBeenCalledWith(
      expect.objectContaining({
        className: expect.stringContaining("rdg-light"),
        defaultColumnOptions: expect.objectContaining({ minWidth: 80 }),
        rowHeight: 32,
      }),
      undefined
    );
  });

  it("keeps static react-data-grid props stable across selection-only rerenders", () => {
    seedRowsQuery(1);
    const tableName =
      "instances/prod/databases/app/schemas/public/tables/customers";

    const { rerender } = render(
      <TableDataGrid name={tableName} selectedRowsSearch={undefined} />
    );
    const firstProps = reactDataGrid.dataGrid.mock.calls.at(-1)?.[0];

    rerender(<TableDataGrid name={tableName} selectedRowsSearch="row-0" />);
    const secondProps = reactDataGrid.dataGrid.mock.calls.at(-1)?.[0];

    expect(firstProps).toBeDefined();
    expect(secondProps).toBeDefined();
    expect(secondProps?.defaultColumnOptions).toBe(
      firstProps?.defaultColumnOptions
    );
    expect(secondProps?.renderers).toBe(firstProps?.renderers);
    expect(secondProps?.rowKeyGetter).toBe(firstProps?.rowKeyGetter);
    const firstRow = secondProps?.rows?.[0];
    if (!firstRow) {
      throw new Error("Expected grid props to include a row.");
    }
    expect(secondProps?.rowKeyGetter?.(firstRow)).toBe("row-0");
  });

  it("keeps prior rows visible with a refreshing pill while placeholder data is shown", () => {
    seedRowsQuery(1, { isFetching: true, isPlaceholderData: true });

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    expect(
      screen.getByRole("status", { name: "Refreshing data" })
    ).toBeTruthy();
    expect(screen.getByText("Refreshing rows…")).toBeTruthy();
    expect(screen.getByTestId("data-grid")).toBeTruthy();
  });

  it("keeps row identity intact when a column is literally named __rowKey", () => {
    tableApi.useListTableColumnsQuery.mockReturnValue({
      data: create(ListTableColumnsResponseSchema, { columns: [] }),
      error: null,
      isError: false,
    });
    const rowKeyColumn = create(TableResultColumnSchema, {
      columnName: "__rowKey",
      dataType: DataType.STRING,
      rawType: "text",
    });
    tableDataApi.useReadRowsQuery.mockReturnValue({
      data: create(ReadRowsResponseSchema, {
        resultSet: create(TableResultSetSchema, {
          columns: [rowKeyColumn],
          rows: [
            create(TableResultRowSchema, {
              rowKey: "server-key",
              values: [
                create(TableCellSchema, {
                  value: create(TableValueSchema, {
                    kind: { case: "stringValue", value: "cell-value" },
                  }),
                }),
              ],
            }),
            create(TableResultRowSchema, {
              rowKey: "",
              values: [
                create(TableCellSchema, {
                  value: create(TableValueSchema, {
                    kind: { case: "stringValue", value: "other" },
                  }),
                }),
              ],
            }),
          ],
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

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    const rows = reactDataGrid.dataGrid.mock.calls.at(-1)?.[0]?.rows ?? [];
    expect(rows[0]?.[ROW_KEY_FIELD]).toBe("server-key");
    expect(rows[0]?.cells.get("__rowKey")).toMatchObject({
      value: { kind: { case: "stringValue", value: "cell-value" } },
    });
    // Index fallback keys are namespaced so they cannot collide with a
    // server-provided row key.
    expect(rows[1]?.[ROW_KEY_FIELD]).toBe(fallbackRowKey(1));
  });
});

describe("TableDataGrid foreign key references", () => {
  beforeEach(setupTableDataGridIntegrationTest);
  afterEach(teardownTableDataGridIntegrationTest);

  it("opens a compact referenced-row preview from a foreign key cell", async () => {
    const user = userEvent.setup();
    let targetQueryState: "error" | "paused" | "success" = "success";
    const shipmentsName =
      "instances/prod/databases/app/schemas/shipping/tables/shipments";
    const carriersName =
      "instances/prod/databases/app/schemas/public/tables/carriers";

    tableApi.useListTableColumnsQuery.mockImplementation((input) => {
      if (input.parent === carriersName) {
        return {
          data: create(ListTableColumnsResponseSchema, {
            columns: [
              create(ColumnSchema, {
                columnName: "id",
                dataType: DataType.INTEGER,
              }),
              create(ColumnSchema, {
                columnName: "name",
                dataType: DataType.STRING,
              }),
            ],
          }),
          error: null,
          isError: false,
        };
      }
      return {
        data: create(ListTableColumnsResponseSchema, { columns: [] }),
        error: null,
        isError: false,
      };
    });
    tableDataApi.useReadRowsQuery.mockImplementation((request) => {
      if (request.name === carriersName) {
        const targetData = create(ReadRowsResponseSchema, {
          resultSet: create(TableResultSetSchema, {
            columns: [
              create(TableResultColumnSchema, {
                columnName: "id",
                dataType: DataType.INTEGER,
                rawType: "int4",
              }),
              create(TableResultColumnSchema, {
                columnName: "name",
                dataType: DataType.STRING,
                rawType: "text",
              }),
            ],
            rows: [
              create(TableResultRowSchema, {
                rowKey: "carrier-214",
                values: [
                  create(TableCellSchema, {
                    value: create(TableValueSchema, {
                      kind: { case: "int64Value", value: 214n },
                    }),
                  }),
                  create(TableCellSchema, {
                    value: create(TableValueSchema, {
                      kind: {
                        case: "stringValue",
                        value: "Maersk Logistics",
                      },
                    }),
                  }),
                ],
              }),
            ],
          }),
        });
        return {
          data: targetQueryState === "paused" ? undefined : targetData,
          dataUpdatedAt: 0,
          error:
            targetQueryState === "error"
              ? new Error("target read failed")
              : null,
          fetchStatus: targetQueryState === "paused" ? "paused" : "idle",
          isError: targetQueryState === "error",
          isFetching: false,
          isLoading: false,
          isPending: targetQueryState === "paused",
          refetch: vi.fn(),
        };
      }
      return {
        data: create(ReadRowsResponseSchema, {
          resultSet: create(TableResultSetSchema, {
            columns: [
              create(TableResultColumnSchema, {
                columnName: "carrier_id",
                dataType: DataType.INTEGER,
                rawType: "int4",
              }),
            ],
            rows: [
              create(TableResultRowSchema, {
                rowKey: "shipment-1",
                values: [
                  create(TableCellSchema, {
                    value: create(TableValueSchema, {
                      kind: { case: "int64Value", value: 214n },
                    }),
                  }),
                ],
              }),
            ],
          }),
        }),
        dataUpdatedAt: 0,
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      };
    });
    tableDataApi.useReadCellValueMutation.mockReturnValue({
      isError: false,
      isPending: false,
      mutate: vi.fn(),
    });

    render(
      <TableDataGrid
        foreignKeyReferences={[
          {
            sourceColumns: ["carrier_id"],
            targetColumns: ["id"],
            targetTableName: carriersName,
          },
        ]}
        name={shipmentsName}
        renderOpenReferencedTableLink={(tableName, onNavigate) => (
          <a
            href={`/explorer?table=${encodeURIComponent(tableName)}`}
            onClick={(event) => {
              event.preventDefault();
              onNavigate?.();
            }}
          >
            Open table
          </a>
        )}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: "Open carrier_id reference 214",
      })
    );

    const trigger = screen.getByRole("button", {
      name: "Open carrier_id reference 214",
    });
    const preview = screen.getByRole("dialog", {
      name: "public.carriers",
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(preview.getAttribute("data-slot")).toBe("popover-content");
    expect(
      within(preview).getByRole("status", { name: "Referenced row loaded" })
    ).toBeTruthy();
    expect(within(preview).getByText("Maersk Logistics")).toBeTruthy();
    expect(
      within(preview).queryByRole("button", { name: "Filter" })
    ).toBeNull();
    expect(
      within(preview).queryByRole("button", { name: "Rows per page" })
    ).toBeNull();

    const targetReadCall = tableDataApi.useReadRowsQuery.mock.calls.find(
      ([request]) => request.name === carriersName
    );
    expect(targetReadCall?.[0].pageSize).toBe(1);
    expect(targetReadCall?.[0].filter?.node).toMatchObject({
      case: "group",
      value: {
        children: [
          {
            node: {
              case: "predicate",
              value: {
                column: "id",
                operator: RowPredicate_Operator.EQUAL,
                values: [{ kind: { case: "int64Value", value: 214n } }],
              },
            },
          },
        ],
      },
    });

    const openTableLink = screen.getByRole("link", { name: "Open table" });
    expect(openTableLink.getAttribute("href")).toBe(
      `/explorer?table=${encodeURIComponent(carriersName)}`
    );
    await user.click(openTableLink);
    expect(
      screen.queryByRole("dialog", { name: "public.carriers" })
    ).toBeNull();

    targetQueryState = "paused";
    await user.click(trigger);
    expect(
      screen.getByRole("status", { name: "Waiting for connection" })
    ).toBeTruthy();
    expect(screen.getByText("Waiting for connection")).toBeTruthy();
    expect(screen.queryByText("Referenced row not found.")).toBeNull();
    await user.keyboard("{Escape}");

    targetQueryState = "error";
    await user.click(trigger);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Maersk Logistics")).toBeNull();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "public.carriers" })
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("TableDataGrid row interactions", () => {
  beforeEach(setupTableDataGridIntegrationTest);
  afterEach(teardownTableDataGridIntegrationTest);

  it("copies a row as a sql insert statement from the context menu", async () => {
    const user = userEvent.setup();
    seedRowsQuery(1);

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    openCellContextMenu("email", 0);
    await user.click(
      screen.getByRole("menuitem", { name: "Copy row as INSERT" })
    );

    expect(writeClipboardMock).toHaveBeenCalledWith(
      `INSERT INTO "public"."customers" ("email") VALUES\n  ('user-0');\n`
    );
  });

  it("copies raw cell and row values without display formatting", async () => {
    const user = userEvent.setup();
    seedRowsQueryWithRawClipboardValues();

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/measurements" />
    );

    openCellContextMenu("measurement", 0);
    await user.click(screen.getByRole("menuitem", { name: "Copy cell" }));

    expect(writeClipboardMock).toHaveBeenLastCalledWith("1234.56789123");

    openCellContextMenu("measurement", 0);
    await user.click(screen.getByRole("menuitem", { name: "Copy row" }));

    expect(writeClipboardMock).toHaveBeenLastCalledWith(
      "1234.56789123\t2024-01-01 12:00:00.123456+00"
    );
  });

  it("copies the cell that opened the menu after rows reorder", async () => {
    const user = userEvent.setup();
    const initialRows = [
      { rowKey: "row-alpha", value: "alpha@example.com" },
      { rowKey: "row-beta", value: "beta@example.com" },
    ];
    seedRowsQuery(initialRows);

    const { rerender } = render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );
    openCellContextMenu("email", 0);

    seedRowsQuery([...initialRows].reverse());
    rerender(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );
    await user.click(screen.getByRole("menuitem", { name: "Copy cell" }));

    expect(writeClipboardMock).toHaveBeenCalledWith("alpha@example.com");
  });

  it("supports keyboard navigation and restores focus to the invoking cell", async () => {
    const user = userEvent.setup();
    seedRowsQuery(1);
    const invokingCell = document.createElement("div");
    invokingCell.tabIndex = 0;
    document.body.append(invokingCell);
    invokingCell.focus();

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );
    openCellContextMenu("email", 0, invokingCell);

    const menu = screen.getByRole("menu", { name: "Cell actions" });
    const items = within(menu).getAllByRole("menuitem");
    await waitFor(() =>
      expect(menu.contains(document.activeElement)).toBe(true)
    );
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(document.activeElement).toBe(items[0]));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[1]);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(items[2]);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(invokingCell));
    expect(screen.queryByRole("menu", { name: "Cell actions" })).toBeNull();
  });

  it("closes the context menu when clicking outside", async () => {
    const user = userEvent.setup();
    seedRowsQuery(1);
    const invokingCell = document.createElement("div");
    invokingCell.tabIndex = 0;
    document.body.append(invokingCell);
    invokingCell.focus();

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );
    openCellContextMenu("email", 0, invokingCell);
    const menu = screen.getByRole("menu", { name: "Cell actions" });
    await waitFor(() =>
      expect(menu.contains(document.activeElement)).toBe(true)
    );

    await user.click(document.body);

    await waitFor(() =>
      expect(screen.queryByRole("menu", { name: "Cell actions" })).toBeNull()
    );
  });

  it("jumps directly to a typed row number from the row drawer", async () => {
    const user = userEvent.setup();
    seedRowsQuery(12);

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    const firstExpandButton = screen
      .getAllByRole("button", { name: "Expand row" })
      .at(0);
    if (!firstExpandButton) {
      throw new Error("Expected at least one row expansion button.");
    }
    await user.click(firstExpandButton);
    expect(screen.queryByRole("spinbutton", { name: "Row number" })).toBeNull();
    const rowNumber = screen.getByRole("textbox", { name: "Row number" });
    expect((rowNumber as HTMLInputElement).type).toBe("text");

    await user.clear(rowNumber);
    await user.type(rowNumber, "6{Enter}");

    expect(
      (
        screen.getByRole("textbox", {
          name: "Row number",
        }) as HTMLInputElement
      ).value
    ).toBe("6");
    expect(screen.getByText("user-5", { selector: "pre" })).toBeTruthy();
  });

  it("keeps the row drawer number field digit-only without inline steppers", async () => {
    const user = userEvent.setup();
    seedRowsQuery(12);

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    const firstExpandButton = screen
      .getAllByRole("button", { name: "Expand row" })
      .at(0);
    if (!firstExpandButton) {
      throw new Error("Expected at least one row expansion button.");
    }
    await user.click(firstExpandButton);

    expect(
      screen.queryByRole("button", { name: "Previous row number" })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Next row number" })
    ).toBeNull();

    const rowNumber = screen.getByRole("textbox", { name: "Row number" });
    await user.clear(rowNumber);
    await user.type(rowNumber, "a6b{Enter}");

    expect((rowNumber as HTMLInputElement).value).toBe("6");
    expect(screen.getByText("user-5", { selector: "pre" })).toBeTruthy();
  });

  it("keeps virtualization enabled for large table pages", () => {
    seedRowsQuery(50);

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    expect(reactDataGrid.dataGrid).toHaveBeenCalledWith(
      expect.objectContaining({ enableVirtualization: true }),
      undefined
    );
  });

  it("automatically fits columns in default and expanded views", async () => {
    const user = userEvent.setup();
    seedRowsQuery(3);

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    expect(latestEmailGridColumn()).toMatchObject({ width: "auto" });

    await user.click(screen.getByRole("button", { name: "Expand data grid" }));

    const expandedGrid = screen.getByRole("dialog", {
      name: "Expanded data grid",
    });
    expect(expandedGrid).toBeTruthy();
    expect(
      within(expandedGrid).queryByText(
        "Use the same filters, sorting, selection, and pagination with more room for rows and columns."
      )
    ).toBeNull();
    expect(
      within(expandedGrid).getByText("Expanded data grid").className
    ).toContain("sr-only");
    expect(
      screen.getByRole("button", { name: "Collapse data grid" })
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fit columns" })).toBeNull();
    expect(latestEmailGridColumn()).toMatchObject({ width: "auto" });

    await user.click(
      screen.getByRole("button", { name: "Collapse data grid" })
    );

    expect(
      screen.queryByRole("dialog", { name: "Expanded data grid" })
    ).toBeNull();
  });

  it("keeps last fetch time in refresh status without showing toolbar text", () => {
    seedRowsQuery(1, {
      dataUpdatedAt: Date.UTC(2026, 5, 14, 10, 30, 15),
    });

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    expect(screen.getByText(LAST_FETCHED_RE).className).toContain("sr-only");
    expect(screen.getByRole("button", { name: "Refresh rows" })).toBeTruthy();
  });

  it("auto refreshes on the global interval and resets after manual refresh", async () => {
    vi.useFakeTimers();
    const refetch = vi.fn().mockResolvedValue(undefined);
    useRefreshSettingsStore.getState().setRefreshIntervalMs(60_000);
    seedRowsQuery(1, {
      dataUpdatedAt: Date.now(),
      refetch,
    });

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    await vi.advanceTimersByTimeAsync(59_999);
    expect(refetch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(refetch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Refresh rows" }));
    expect(refetch).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(59_999);
    expect(refetch).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(refetch).toHaveBeenCalledTimes(3);
  });

  it("does not overwrite an active text selection when copying from the grid", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    seedRowsQuery(1);

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    const selectedText = screen.getByText("user-0");
    const range = document.createRange();
    range.selectNodeContents(selectedText);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const gridProps = reactDataGrid.dataGrid.mock.calls.at(-1)?.[0];
    const copiedRow = gridProps?.rows?.[0];
    const copiedColumn = gridProps?.columns?.find(
      (column) => column.key === "email"
    );
    if (!(gridProps?.onCellCopy && copiedRow && copiedColumn)) {
      throw new Error("Expected grid copy props.");
    }
    gridProps.onCellCopy({ column: copiedColumn, row: copiedRow }, {
      currentTarget: screen.getByTestId("data-grid"),
    } as ReactClipboardEvent<HTMLDivElement>);

    expect(writeText).not.toHaveBeenCalled();
    selection?.removeAllRanges();
  });
});

describe("TableDataGrid truncated-cell copy", () => {
  beforeEach(setupTableDataGridIntegrationTest);
  afterEach(teardownTableDataGridIntegrationTest);

  it("fetches the full value before copying a truncated cell", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({
      value: create(TableCellSchema, {
        value: create(TableValueSchema, {
          kind: { case: "stringValue", value: "the complete text" },
        }),
      }),
    });
    seedRowsQueryWithTruncatedCell(mutateAsync);

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    openCellContextMenu("notes", 0);
    await user.click(screen.getByRole("menuitem", { name: "Copy cell" }));

    expect(writeClipboardMock).not.toHaveBeenCalled();
    expect(writeClipboardDeferredMock).toHaveBeenCalledTimes(1);
    const getText = writeClipboardDeferredMock.mock.calls[0]?.[0];
    await expect(getText()).resolves.toBe("the complete text");
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        fullValueToken: "token-notes",
        name: "instances/prod/databases/app/schemas/public/tables/customers",
      })
    );
  });

  it("surfaces a failed full-value fetch instead of copying the preview", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockRejectedValue(new Error("token expired"));
    seedRowsQueryWithTruncatedCell(mutateAsync);

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    openCellContextMenu("notes", 0);
    await user.click(screen.getByRole("menuitem", { name: "Copy cell" }));

    expect(writeClipboardMock).not.toHaveBeenCalled();
    const getText = writeClipboardDeferredMock.mock.calls[0]?.[0];
    await expect(getText()).rejects.toThrow("token expired");
  });

  it("resolves truncated cells when copying a row as INSERT", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({
      value: create(TableCellSchema, {
        value: create(TableValueSchema, {
          kind: { case: "stringValue", value: "the complete text" },
        }),
      }),
    });
    seedRowsQueryWithTruncatedCell(mutateAsync);

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    openCellContextMenu("notes", 0);
    await user.click(
      screen.getByRole("menuitem", { name: "Copy row as INSERT" })
    );

    expect(writeClipboardDeferredMock).toHaveBeenCalledTimes(1);
    const getText = writeClipboardDeferredMock.mock.calls[0]?.[0];
    await expect(getText()).resolves.toBe(
      `INSERT INTO "public"."customers" ("notes") VALUES\n  ('the complete text');\n`
    );
  });
});

describe("TableDataGrid value dialogs", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
    useRefreshSettingsStore.getState().setRefreshIntervalMs(null);
  });

  it("keeps data value expansion to one dialog at a time", async () => {
    seedRowsQueryWithExpandableValues();

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/products" />
    );

    const metadataExpand = screen.getByRole("button", {
      name: "View full JSON for metadata",
    });
    const tagsExpand = screen.getByRole("button", {
      name: "View full array for tags",
    });

    fireEvent.click(metadataExpand);

    expect(screen.getByRole("dialog", { name: "metadata JSON" })).toBeTruthy();

    fireEvent.click(tagsExpand);

    await waitFor(() => {
      expect(screen.getAllByRole("dialog", { hidden: true }).length).toBe(1);
    });
    expect(screen.queryByRole("dialog", { name: "tags array" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "metadata JSON" })).toBeTruthy();
  });

  it("keeps expanded grid data value expansion to one dialog at a time", async () => {
    const user = userEvent.setup();
    seedRowsQueryWithExpandableValues();

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/products" />
    );

    await user.click(screen.getByRole("button", { name: "Expand data grid" }));

    const expandedGrid = screen.getByRole("dialog", {
      name: "Expanded data grid",
    });
    const metadataExpand = within(expandedGrid).getByRole("button", {
      name: "View full JSON for metadata",
    });
    const tagsExpand = within(expandedGrid).getByRole("button", {
      name: "View full array for tags",
    });

    fireEvent.click(metadataExpand);

    expect(screen.getByRole("dialog", { name: "metadata JSON" })).toBeTruthy();

    fireEvent.click(tagsExpand);

    await waitFor(() => {
      expect(screen.getAllByRole("dialog", { hidden: true }).length).toBe(2);
    });
    expect(screen.queryByRole("dialog", { name: "tags array" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "metadata JSON" })).toBeTruthy();
    expect(
      screen.getByRole("dialog", { name: "Expanded data grid" })
    ).toBeTruthy();
  });
});

describe("TableDataGrid toolbar", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    useRefreshSettingsStore.getState().setRefreshIntervalMs(null);
  });

  it("orders toolbar actions with refresh after the main controls", () => {
    seedRowsQuery(1, {
      dataUpdatedAt: Date.UTC(2026, 5, 14, 10, 30, 15),
    });

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    const filterButton = screen.getByRole("button", { name: FILTER_BUTTON_RE });
    const sortButton = screen.getByRole("button", { name: "Sort" });
    const columnsButton = screen.getByRole("button", { name: "Columns" });
    const expandButton = screen.getByRole("button", {
      name: "Expand data grid",
    });
    const refreshButton = screen.getByRole("button", {
      name: "Refresh rows",
    });

    expect(expandButton.textContent).toContain("Expand");
    expect(filterButton.compareDocumentPosition(sortButton)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(sortButton.compareDocumentPosition(columnsButton)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(columnsButton.compareDocumentPosition(expandButton)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(expandButton.compareDocumentPosition(refreshButton)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it("labels the filter with the selected relation", async () => {
    const user = userEvent.setup();
    seedRowsQuery(1);

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    await user.click(screen.getByRole("button", { name: "Filter" }));

    expect(
      screen.getByRole("dialog", { name: "Filter public.customers" })
    ).toBeTruthy();
  });

  it("keeps export out of the toolbar until rows are selected", () => {
    seedRowsQuery(1, {
      dataUpdatedAt: Date.UTC(2026, 5, 14, 10, 30, 15),
    });

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    const expandButton = screen.getByRole("button", {
      name: "Expand data grid",
    });
    const refreshButton = screen.getByRole("button", {
      name: "Refresh rows",
    });
    const fetchStatus = screen.getByText(LAST_FETCHED_RE);

    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
    expect(expandButton.compareDocumentPosition(refreshButton)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(fetchStatus.className).toContain("sr-only");
    expect(fetchStatus.className).not.toContain("not-sr-only");
  });
});

describe("TableDataGrid column layout", () => {
  beforeEach(setupTableDataGridIntegrationTest);
  afterEach(teardownTableDataGridIntegrationTest);

  it("hides a data column from the Columns popover", async () => {
    const user = userEvent.setup();
    seedRowsQueryWithRawClipboardValues();

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/measurements" />
    );

    expect(
      reactDataGrid.dataGrid.mock.calls
        .at(-1)?.[0]
        ?.columns?.map((column) => column.key)
    ).toEqual(["__select", EXPAND_COLUMN_KEY, "measurement", "observed_at"]);

    await user.click(screen.getByRole("button", { name: "Columns" }));
    await user.click(screen.getByRole("checkbox", { name: "measurement" }));

    await waitFor(() => {
      expect(
        reactDataGrid.dataGrid.mock.calls
          .at(-1)?.[0]
          ?.columns?.map((column) => column.key)
      ).toEqual(["__select", EXPAND_COLUMN_KEY, "observed_at"]);
    });
    expect(
      screen
        .getByRole("checkbox", { name: "observed_at" })
        .getAttribute("aria-disabled")
    ).toBe("true");
  });

  it("persists layout for one table without leaking it to another", async () => {
    const user = userEvent.setup();
    const measurements =
      "instances/prod/databases/app/schemas/public/tables/measurements";
    seedRowsQueryWithRawClipboardValues();
    const firstRender = render(<TableDataGrid name={measurements} />);
    await user.click(screen.getByRole("button", { name: "Columns" }));
    await user.click(screen.getByRole("checkbox", { name: "measurement" }));
    firstRender.unmount();

    const secondRender = render(<TableDataGrid name={measurements} />);
    expect(
      reactDataGrid.dataGrid.mock.calls
        .at(-1)?.[0]
        ?.columns?.map((column) => column.key)
    ).toEqual(["__select", EXPAND_COLUMN_KEY, "observed_at"]);
    secondRender.unmount();

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/other_measurements" />
    );
    expect(
      reactDataGrid.dataGrid.mock.calls
        .at(-1)?.[0]
        ?.columns?.map((column) => column.key)
    ).toEqual(["__select", EXPAND_COLUMN_KEY, "measurement", "observed_at"]);
  });

  it("reorders columns with keyboard-accessible controls", async () => {
    const user = userEvent.setup();
    seedRowsQueryWithRawClipboardValues();
    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/measurements" />
    );

    await user.click(screen.getByRole("button", { name: "Columns" }));
    await user.click(
      screen.getByRole("button", { name: "Move observed_at up" })
    );

    await waitFor(() => {
      expect(
        reactDataGrid.dataGrid.mock.calls
          .at(-1)?.[0]
          ?.columns?.map((column) => column.key)
      ).toEqual(["__select", EXPAND_COLUMN_KEY, "observed_at", "measurement"]);
    });
  });

  it("reorders and persists columns dragged by their grid headers", async () => {
    const tableName =
      "instances/prod/databases/app/schemas/public/tables/measurements";
    seedRowsQueryWithRawClipboardValues();
    render(<TableDataGrid name={tableName} />);
    const gridProps = reactDataGrid.dataGrid.mock.calls.at(-1)?.[0];

    expect(
      gridProps?.columns?.slice(2).map((column) => column.draggable)
    ).toEqual([true, true]);
    expect(gridProps?.onColumnsReorder).toBeTypeOf("function");

    act(() => {
      gridProps?.onColumnsReorder?.("observed_at", "measurement");
    });

    await waitFor(() => {
      expect(
        reactDataGrid.dataGrid.mock.calls
          .at(-1)?.[0]
          ?.columns?.map((column) => column.key)
      ).toEqual(["__select", EXPAND_COLUMN_KEY, "observed_at", "measurement"]);
    });
    expect(
      useTableColumnLayoutSettingsStore.getState().layouts[tableName]?.order
    ).toEqual(["observed_at", "measurement"]);
  });

  it("resets visibility and order to the database layout", async () => {
    const user = userEvent.setup();
    seedRowsQueryWithRawClipboardValues();
    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/measurements" />
    );
    await user.click(screen.getByRole("button", { name: "Columns" }));
    await user.click(screen.getByRole("checkbox", { name: "measurement" }));
    await user.click(
      screen.getByRole("button", { name: "Move observed_at up" })
    );

    await user.click(screen.getByRole("button", { name: "Reset columns" }));

    await waitFor(() => {
      expect(
        reactDataGrid.dataGrid.mock.calls
          .at(-1)?.[0]
          ?.columns?.map((column) => column.key)
      ).toEqual(["__select", EXPAND_COLUMN_KEY, "measurement", "observed_at"]);
    });
  });

  it("hides a column from its header menu", async () => {
    const user = userEvent.setup();
    seedRowsQueryWithRawClipboardValues();
    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/measurements" />
    );

    await user.click(
      screen.getByRole("button", {
        name: "Open options for column measurement",
      })
    );
    await user.click(screen.getByRole("menuitem", { name: "Hide column" }));

    await waitFor(() => {
      expect(
        reactDataGrid.dataGrid.mock.calls
          .at(-1)?.[0]
          ?.columns?.map((column) => column.key)
      ).toEqual(["__select", EXPAND_COLUMN_KEY, "observed_at"]);
    });
  });

  it("keeps saved layout while row metadata is unavailable", async () => {
    const tableName =
      "instances/prod/databases/app/schemas/public/tables/measurements";
    useTableColumnLayoutSettingsStore.getState().setLayout(tableName, {
      hiddenColumns: ["measurement"],
      order: ["observed_at", "measurement"],
    });
    seedRowsQueryError(new Error("rows unavailable"));

    render(<TableDataGrid name={tableName} />);

    await waitFor(() => {
      expect(
        useTableColumnLayoutSettingsStore.getState().layouts[tableName]
      ).toEqual({
        hiddenColumns: ["measurement"],
        order: ["observed_at", "measurement"],
      });
    });
  });

  it("keeps hidden values in row copy output", async () => {
    const user = userEvent.setup();
    seedRowsQueryWithRawClipboardValues();
    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/measurements" />
    );
    await user.click(screen.getByRole("button", { name: "Columns" }));
    await user.click(screen.getByRole("checkbox", { name: "measurement" }));
    await user.keyboard("{Escape}");

    openCellContextMenu("observed_at", 0);
    await user.click(screen.getByRole("menuitem", { name: "Copy row" }));

    expect(writeClipboardMock).toHaveBeenLastCalledWith(
      "1234.56789123\t2024-01-01 12:00:00.123456+00"
    );
  });

  it("keeps hidden columns available to filters and sorts", async () => {
    const user = userEvent.setup();
    seedRowsQueryWithRawClipboardValues();
    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/measurements" />
    );
    await user.click(screen.getByRole("button", { name: "Columns" }));
    await user.click(screen.getByRole("checkbox", { name: "measurement" }));
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(screen.getByRole("combobox", { name: "Filter column" }));
    // The filter column picker labels each option with its raw type.
    expect(
      screen.getByRole("option", { name: "measurement double precision" })
    ).toBeTruthy();
    await user.keyboard("{Escape}{Escape}");

    await user.click(screen.getByRole("button", { name: "Sort" }));
    await user.click(screen.getByRole("combobox", { name: "Add sort column" }));
    expect(screen.getByRole("option", { name: "measurement" })).toBeTruthy();
  });

  it("keeps actions frozen and restores a data column's frozen state after hide and show", async () => {
    const user = userEvent.setup();
    seedRowsQueryWithRawClipboardValues();
    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/measurements" />
    );
    const openMeasurementOptions = () =>
      user.click(
        screen.getByRole("button", {
          name: "Open options for column measurement",
        })
      );
    await openMeasurementOptions();
    await user.click(screen.getByRole("menuitem", { name: "Freeze column" }));
    await openMeasurementOptions();
    await user.click(screen.getByRole("menuitem", { name: "Hide column" }));

    // The action region (select → expand) is always pinned left so the row
    // checkbox and expand affordance stay reachable while data columns scroll.
    expect(
      reactDataGrid.dataGrid.mock.calls
        .at(-1)?.[0]
        ?.columns?.find((column) => column.key === "__select")?.frozen
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Columns" }));
    await user.click(screen.getByRole("checkbox", { name: "measurement" }));

    await waitFor(() => {
      expect(
        reactDataGrid.dataGrid.mock.calls
          .at(-1)?.[0]
          ?.columns?.find((column) => column.key === "measurement")?.frozen
      ).toBe(true);
    });
  });
});

describe("TableDataGrid URL state", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps page size interactive when no router callback owns the URL state", async () => {
    const user = userEvent.setup();
    seedRowsQuery(3);

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "100" }));

    await waitFor(() => {
      expect(
        tableDataApi.useReadRowsQuery.mock.calls.at(-1)?.[0]
      ).toMatchObject({
        pageSize: 100,
      });
    });
  });

  it("keeps frozen columns interactive when no router callback owns the URL state", async () => {
    const user = userEvent.setup();
    seedRowsQuery(3);

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    await user.click(
      screen.getByRole("button", {
        name: "Open options for column email",
      })
    );
    await user.click(screen.getByRole("menuitem", { name: "Freeze column" }));

    await waitFor(() => {
      const columns =
        reactDataGrid.dataGrid.mock.calls.at(-1)?.[0]?.columns ?? [];
      expect(columns.find((column) => column.key === "email")).toMatchObject({
        frozen: true,
      });
    });
  });

  it("emits URL resets once and only after navigation in StrictMode", async () => {
    const onOpenRowSearchChange = vi.fn();
    const onSelectedRowsSearchChange = vi.fn();
    seedRowsQuery(3);

    const { rerender } = render(
      <StrictMode>
        <TableDataGrid
          name="instances/prod/databases/app/schemas/public/tables/customers"
          onOpenRowSearchChange={onOpenRowSearchChange}
          onSelectedRowsSearchChange={onSelectedRowsSearchChange}
          openRowSearch="row-0"
          selectedRowsSearch="row-0"
        />
      </StrictMode>
    );

    expect(onOpenRowSearchChange).not.toHaveBeenCalled();
    expect(onSelectedRowsSearchChange).not.toHaveBeenCalled();

    rerender(
      <StrictMode>
        <TableDataGrid
          name="instances/prod/databases/app/schemas/public/tables/orders"
          onOpenRowSearchChange={onOpenRowSearchChange}
          onSelectedRowsSearchChange={onSelectedRowsSearchChange}
          openRowSearch="row-0"
          selectedRowsSearch="row-0"
        />
      </StrictMode>
    );

    await waitFor(() => {
      expect(onOpenRowSearchChange).toHaveBeenCalledTimes(1);
      expect(onSelectedRowsSearchChange).toHaveBeenCalledTimes(1);
    });
    expect(onOpenRowSearchChange).toHaveBeenCalledWith(undefined);
    expect(onSelectedRowsSearchChange).toHaveBeenCalledWith(undefined);
  });

  it("emits controlled state for page size, row selection, selected cell, open row, and frozen columns", async () => {
    const user = userEvent.setup();
    const onCellSearchChange = vi.fn();
    const onFrozenColumnsSearchChange = vi.fn();
    const onOpenRowSearchChange = vi.fn();
    const onPageSizeSearchChange = vi.fn();
    const onSelectedRowsSearchChange = vi.fn();
    seedRowsQuery(3);

    render(
      <TableDataGrid
        name="instances/prod/databases/app/schemas/public/tables/customers"
        onCellSearchChange={onCellSearchChange}
        onFrozenColumnsSearchChange={onFrozenColumnsSearchChange}
        onOpenRowSearchChange={onOpenRowSearchChange}
        onPageSizeSearchChange={onPageSizeSearchChange}
        onSelectedRowsSearchChange={onSelectedRowsSearchChange}
      />
    );

    const gridProps = reactDataGrid.dataGrid.mock.calls.at(-1)?.[0];
    const firstRow = gridProps?.rows?.[0];
    const emailColumn = gridProps?.columns?.find(
      (column) => column.key === "email"
    );
    if (
      !(
        gridProps?.onSelectedRowsChange &&
        gridProps.onActivePositionChange &&
        firstRow &&
        emailColumn
      )
    ) {
      throw new Error("Expected grid selection props.");
    }

    gridProps.onSelectedRowsChange(new Set(["row-0"]));
    gridProps.onActivePositionChange({
      column: emailColumn,
      row: firstRow,
      rowIdx: 0,
    });

    const freezeButton = screen.getByRole("button", {
      name: "Open options for column email",
    });
    await user.click(freezeButton);
    await user.click(screen.getByRole("menuitem", { name: "Freeze column" }));

    expect(onFrozenColumnsSearchChange).toHaveBeenCalledWith("email");

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "100" }));

    expect(onPageSizeSearchChange).toHaveBeenCalledWith(100);

    const firstExpandButton = screen
      .getAllByRole("button", { name: "Expand row" })
      .at(0);
    if (!firstExpandButton) {
      throw new Error("Expected row expansion button.");
    }
    await user.click(firstExpandButton);

    expect(onSelectedRowsSearchChange).toHaveBeenCalledWith("row-0");
    expect(onCellSearchChange).toHaveBeenCalledWith("row-0:email");
    expect(onOpenRowSearchChange).toHaveBeenCalledWith("row-0");

    gridProps.onActivePositionChange({
      column: undefined,
      row: firstRow,
      rowIdx: 0,
    });
    expect(onCellSearchChange).toHaveBeenLastCalledWith(undefined);
  });

  it("keeps selected-row actions limited to copy and export", () => {
    seedRowsQuery(3);

    render(
      <TableDataGrid
        name="instances/prod/databases/app/schemas/public/tables/customers"
        selectedRowsSearch="row-0"
      />
    );

    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: DELETE_BUTTON_RE })).toBeNull();
    expect(screen.queryByRole("button", { name: EDIT_BUTTON_RE })).toBeNull();
  });
});

describe("TableDataGrid error recovery", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("shows a retry button when the rows query fails", () => {
    seedRowsQueryError(new Error("connection refused"));

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    expect(screen.getByRole("button", { name: RETRY_BUTTON_RE })).toBeTruthy();
  });

  test("renders SQLSTATE-aware row-load errors with retry and copyable details", async () => {
    const user = userEvent.setup();
    seedRowsQueryError(createPostgresRowsError());

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    expect(screen.getByText("PostgreSQL query timed out")).toBeTruthy();
    expect(screen.getByText("Retry later.")).toBeTruthy();
    expect(screen.getByRole("button", { name: RETRY_BUTTON_RE })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Error details" }));

    expect(screen.getByText("Code: DeadlineExceeded")).toBeTruthy();
    expect(screen.getByText("SQLSTATE: 57014")).toBeTruthy();
    expect(screen.getByText("Condition: query_canceled")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy details" })).toBeTruthy();
  });

  test("renders Querylane live-query saturation with retry guidance", () => {
    seedRowsQueryError(createLiveQueryLimitError());

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    expect(screen.getByText("Query limit reached")).toBeTruthy();
    expect(
      screen.getByText(
        "Another query or export is using the available capacity. Try again when it finishes."
      )
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: RETRY_BUTTON_RE })).toBeTruthy();
  });

  test("clicking the retry button triggers a refetch", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue(undefined);
    tableApi.useListTableColumnsQuery.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
    });
    tableDataApi.useReadRowsQuery.mockReturnValue({
      data: undefined,
      error: new Error("timeout"),
      isFetching: false,
      isLoading: false,
      refetch,
    });
    tableDataApi.useReadCellValueMutation.mockReturnValue({
      isError: false,
      isPending: false,
      mutate: vi.fn(),
    });

    render(
      <TableDataGrid name="instances/prod/databases/app/schemas/public/tables/customers" />
    );

    await user.click(screen.getByRole("button", { name: RETRY_BUTTON_RE }));

    await waitFor(() => expect(refetch).toHaveBeenCalledOnce());
  });

  test("shows every invalid filter error and lets users clear filters", async () => {
    const user = userEvent.setup();
    const onFilterSearchChange = vi.fn();
    seedRowsQuery(1);
    tableApi.useListTableColumnsQuery.mockReturnValue({
      data: create(ListTableColumnsResponseSchema, {
        columns: [
          create(ColumnSchema, {
            columnName: "active",
            dataType: DataType.BOOLEAN,
          }),
        ],
      }),
      error: null,
      isError: false,
      refetch: vi.fn(),
    });

    render(
      <TableDataGrid
        filterSearch={JSON.stringify({
          l: "and",
          r: [
            { c: "active", i: "active", o: "eq", v: "maybe" },
            { c: "missing", i: "missing", o: "eq", v: "x" },
          ],
        })}
        name="instances/prod/databases/app/schemas/public/tables/customers"
        onFilterSearchChange={onFilterSearchChange}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Filter not applied" })
    ).toBeTruthy();
    expect(screen.getByText("active expects true or false.")).toBeTruthy();
    expect(screen.getByText("missing is not available.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(onFilterSearchChange).toHaveBeenCalledWith(undefined);
  });
});
