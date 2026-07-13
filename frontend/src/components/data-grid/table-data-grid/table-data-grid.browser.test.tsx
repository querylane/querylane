import { create as createProto } from "@bufbuild/protobuf";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { ColumnHeader } from "@/components/data-grid/table-data-grid/column-header";
import { DataCell } from "@/components/data-grid/table-data-grid/data-cell";
import { DataGridToolbar } from "@/components/data-grid/table-data-grid/data-grid-toolbar";
import { DataValueDialogProvider } from "@/components/data-grid/table-data-grid/data-value-dialog-provider";
import { GridStatusBar } from "@/components/data-grid/table-data-grid/grid-status-bar";
import { GridSurface } from "@/components/data-grid/table-data-grid/grid-surface";
import { PaginationFooter } from "@/components/data-grid/table-data-grid/pagination-footer";
import { RecordDetailDrawer } from "@/components/data-grid/table-data-grid/record-detail-drawer";
import { TableDataGrid } from "@/components/data-grid/table-data-grid/table-data-grid";
import {
  ReadRowsResponseSchema,
  type TableCell,
  TableCellSchema,
  TableResultColumnSchema,
  TableResultRowSchema,
  TableResultSetSchema,
  type TableValue,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import {
  ColumnSchema,
  DataType,
  ListTableColumnsResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

import "@/components/data-grid/table-data-grid/data-grid-theme.css";

const tableApi = vi.hoisted(() => ({
  useListTableColumnsQuery: vi.fn((_input: { parent: string }) => ({
    data: undefined as unknown,
    error: null,
    isError: false,
    refetch: vi.fn(),
  })),
}));

const tableDataApi = vi.hoisted(() => ({
  useReadCellValueMutation: vi.fn(() => ({
    isError: false,
    isPending: false,
    mutate: vi.fn(),
  })),
  useReadRowsQuery: vi.fn(),
  useStreamRowsExporter: vi.fn(() => vi.fn()),
}));

vi.mock("@/hooks/api/table", () => ({
  useListTableColumnsQuery: tableApi.useListTableColumnsQuery,
}));

vi.mock("@/hooks/api/table-data", () => ({
  useReadCellValueMutation: tableDataApi.useReadCellValueMutation,
  useReadRowsQuery: tableDataApi.useReadRowsQuery,
  useStreamRowsExporter: tableDataApi.useStreamRowsExporter,
}));

const SQL_WHERE_HELP_RE = /Supports column comparisons joined with AND/;
afterEach(() => {
  tableApi.useListTableColumnsQuery.mockReset();
  tableDataApi.useReadRowsQuery.mockReset();
});

const EMPTY_FILTER_HELP_RE =
  /Pick a column, choose an operator, then enter a value\. Use/;
const shipmentsName =
  "instances/prod/databases/app/schemas/shipping/tables/shipments";
const carriersName =
  "instances/prod/databases/app/schemas/public/tables/carriers";
const longSchemaName = `schema_${"x".repeat(56)}`;
const longCarriersName = `instances/prod/databases/app/schemas/${longSchemaName}/tables/carriers`;

function browserColorChannels(color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("expected a 2D canvas context");
  }
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  return Array.from(context.getImageData(0, 0, 1, 1).data);
}

function colorContrastRatio(first: string, second: string) {
  function compositeColor(foreground: string, background: string) {
    const foregroundChannels = browserColorChannels(foreground);
    const backgroundChannels = browserColorChannels(background);
    const alpha = (foregroundChannels[3] ?? 255) / 255;
    return foregroundChannels
      .slice(0, 3)
      .map(
        (channel, index) =>
          channel * alpha + (backgroundChannels[index] ?? 0) * (1 - alpha)
      );
  }
  function relativeLuminance(channels: number[]) {
    const linearChannels = channels.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.040_45
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return (
      0.2126 * (linearChannels[0] ?? 0) +
      0.7152 * (linearChannels[1] ?? 0) +
      0.0722 * (linearChannels[2] ?? 0)
    );
  }
  const firstLuminance = relativeLuminance(compositeColor(first, second));
  const secondLuminance = relativeLuminance(
    browserColorChannels(second).slice(0, 3)
  );
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function column(name: string, rawType: string, dataType: DataType) {
  return createProto(TableResultColumnSchema, {
    columnName: name,
    dataType,
    isNullable: name !== "id",
    mayTruncate: name === "email" || name === "metadata",
    rawType,
  });
}

function cell(value: TableValue["kind"], truncated = false) {
  return createProto(TableCellSchema, {
    fullValueToken: truncated ? "full-value-token" : "",
    truncated,
    value: createProto(TableValueSchema, { kind: value }),
  });
}

function seedForeignKeyGridQueries(targetTableName = carriersName) {
  tableApi.useListTableColumnsQuery.mockImplementation((input) => {
    if (input.parent === targetTableName) {
      return {
        data: createProto(ListTableColumnsResponseSchema, {
          columns: [
            createProto(ColumnSchema, {
              columnName: "id",
              dataType: DataType.INTEGER,
            }),
            createProto(ColumnSchema, {
              columnName: "code",
              dataType: DataType.STRING,
            }),
            createProto(ColumnSchema, {
              columnName: "name",
              dataType: DataType.STRING,
            }),
          ],
        }),
        error: null,
        isError: false,
        refetch: vi.fn(),
      };
    }

    return {
      data: createProto(ListTableColumnsResponseSchema, { columns: [] }),
      error: null,
      isError: false,
      refetch: vi.fn(),
    };
  });

  tableDataApi.useReadRowsQuery.mockImplementation((request) => {
    if (request.name === targetTableName) {
      return {
        data: createProto(ReadRowsResponseSchema, {
          resultSet: createProto(TableResultSetSchema, {
            columns: [
              column("id", "int4", DataType.INTEGER),
              column("code", "text", DataType.STRING),
              column("name", "text", DataType.STRING),
            ],
            rows: [
              createProto(TableResultRowSchema, {
                rowKey: "carrier-214",
                values: [
                  cell({ case: "int64Value", value: 214n }),
                  cell({ case: "stringValue", value: "HCL" }),
                  cell({
                    case: "stringValue",
                    value: "Hanse Container Line",
                  }),
                ],
              }),
            ],
          }),
        }),
        dataUpdatedAt: 1_782_882_000_000,
        error: null,
        isFetching: false,
        isLoading: false,
        isPlaceholderData: false,
        refetch: vi.fn(),
      };
    }

    return {
      data: createProto(ReadRowsResponseSchema, {
        resultSet: createProto(TableResultSetSchema, {
          columns: [
            column("ref", "text", DataType.STRING),
            column("carrier_id", "int4", DataType.INTEGER),
            column("status", "shipment_status", DataType.STRING),
            column("origin_port", "text", DataType.STRING),
            column("dest_port", "text", DataType.STRING),
          ],
          rows: [
            createProto(TableResultRowSchema, {
              rowKey: "shipment-1",
              values: [
                cell({ case: "stringValue", value: "ML-2026-048291" }),
                cell({ case: "int64Value", value: 214n }),
                cell({ case: "stringValue", value: "in_transit" }),
                cell({ case: "stringValue", value: "CNSHA" }),
                cell({ case: "stringValue", value: "DEHAM" }),
              ],
            }),
          ],
        }),
      }),
      dataUpdatedAt: 1_782_882_000_000,
      error: null,
      isFetching: false,
      isLoading: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    };
  });
}

const resultColumns = [
  column("id", "uuid", DataType.STRING),
  column("email", "text", DataType.STRING),
  column("metadata", "jsonb", DataType.JSON),
  column("active", "bool", DataType.BOOLEAN),
  column("last_seen_at", "timestamptz", DataType.TIMESTAMP),
];

const sortableColumns = [
  column("stat_date", "date", DataType.DATE),
  column("new_customers", "integer", DataType.INTEGER),
  column("page_views", "integer", DataType.INTEGER),
  column("total_revenue", "numeric", DataType.FLOAT),
  column("total_orders", "integer", DataType.INTEGER),
];

function renderDataExplorerSurfaces() {
  const rowCells = new Map<string, TableCell | undefined>([
    ["id", cell({ case: "stringValue", value: "cst_0000000001" })],
    [
      "email",
      cell(
        {
          case: "stringValue",
          value: "alexandra.long.email.alias@enterprise-customer.example.com",
        },
        true
      ),
    ],
    [
      "metadata",
      cell({ case: "jsonValue", value: '{"tier":"enterprise","seats":250}' }),
    ],
    ["active", cell({ case: "boolValue", value: true })],
    [
      "last_seen_at",
      cell({ case: "timestampValue", value: "2026-05-20T11:30:00Z" }),
    ],
  ]);

  render(
    <ScreenshotFrame>
      <div className="w-[1120px] space-y-5 rounded-2xl border border-border bg-background p-6 text-foreground">
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3">
            <h1 className="font-semibold text-xl">Data explorer controls</h1>
            <p className="text-muted-foreground text-sm">
              Selection, sorting, refresh, row counts, and pagination must stay
              compact while the data area scales.
            </p>
          </div>
          <DataGridToolbar
            columns={resultColumns}
            filterLogic="and"
            filterRules={[
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
            ]}
            isFetching={true}
            onClearSelection={vi.fn()}
            onCopySelection={vi.fn()}
            onExportSelection={vi.fn()}
            onFilterChange={vi.fn()}
            onRefresh={vi.fn()}
            onSortChange={vi.fn()}
            selectedCount={3}
            sortColumns={[
              { columnKey: "email", direction: "ASC" },
              { columnKey: "last_seen_at", direction: "DESC" },
            ]}
          />
          <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
            <PaginationFooter
              hasNext={true}
              hasPrev={true}
              onNext={vi.fn()}
              onPageSizeChange={vi.fn()}
              onPrev={vi.fn()}
              pageLabel="Page 3 of 6"
              pageSize={25}
            />
          </div>
        </section>

        <RecordDetailDrawer
          columns={resultColumns}
          hasNext={true}
          hasPrev={false}
          name="instances/prod/databases/app/schemas/public/tables/customers"
          onNext={vi.fn()}
          onOpenChange={vi.fn()}
          onPrev={vi.fn()}
          onRowIndexChange={vi.fn()}
          open={true}
          pkColumnSet={new Set(["id"])}
          rowCells={rowCells}
          rowCount={2}
          rowIndex={0}
          tableName={{ schema: "public", table: "customers" }}
        />
      </div>
    </ScreenshotFrame>
  );
}

function renderLongRecordDrawer() {
  const columns = [
    column("implementation_info_id", "character varying", DataType.STRING),
    column("implementation_info_name", "character varying", DataType.STRING),
    column("integer_value", "integer", DataType.INTEGER),
    column("character_value", "character varying", DataType.STRING),
    column("comments", "character varying", DataType.STRING),
  ];
  const rowCells = new Map<string, TableCell | undefined>([
    ["implementation_info_id", cell({ case: "stringValue", value: "13" })],
    [
      "implementation_info_name",
      cell({ case: "stringValue", value: "SERVER NAME" }),
    ],
    ["integer_value", cell({ case: "nullValue", value: 0 })],
    ["character_value", cell({ case: "stringValue", value: "" })],
    ["comments", cell({ case: "nullValue", value: 0 })],
  ]);

  render(
    <ScreenshotFrame>
      <div className="w-[980px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <RecordDetailDrawer
          columns={columns}
          hasNext={true}
          hasPrev={true}
          name="instances/prod/databases/app/schemas/information_schema/tables/sql_implementation_info"
          onNext={vi.fn()}
          onOpenChange={vi.fn()}
          onPrev={vi.fn()}
          onRowIndexChange={vi.fn()}
          open={true}
          pkColumnSet={new Set()}
          rowCells={rowCells}
          rowCount={12}
          rowIndex={8}
          tableName={{
            schema: "information_schema",
            table: "sql_implementation_info_with_extra_long_suffix",
          }}
        />
      </div>
    </ScreenshotFrame>
  );
}

function renderFilteredToolbar() {
  render(
    <ScreenshotFrame>
      <div className="w-[900px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3">
            <h1 className="font-semibold text-xl">Filtered data explorer</h1>
            <p className="text-muted-foreground text-sm">
              Active server-side filters stay visible beside sort and refresh
              controls.
            </p>
          </div>
          <DataGridToolbar
            columns={resultColumns}
            filterLogic="or"
            filterRules={[
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
            ]}
            isFetching={false}
            onClearSelection={vi.fn()}
            onCopySelection={vi.fn()}
            onExportSelection={vi.fn()}
            onFilterChange={vi.fn()}
            onRefresh={vi.fn()}
            onSortChange={vi.fn()}
            selectedCount={0}
            sortColumns={[{ columnKey: "last_seen_at", direction: "DESC" }]}
          />
        </section>
      </div>
    </ScreenshotFrame>
  );
}

function renderEmptyFilterToolbar() {
  render(
    <ScreenshotFrame>
      <div className="w-[900px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <DataGridToolbar
          columns={resultColumns}
          filterLogic="and"
          filterRules={[]}
          filterTitle="Filter shipping.carriers"
          isFetching={false}
          onClearSelection={vi.fn()}
          onCopySelection={vi.fn()}
          onExportSelection={vi.fn()}
          onFilterChange={vi.fn()}
          onRefresh={vi.fn()}
          onSortChange={vi.fn()}
          selectedCount={0}
          sortColumns={[]}
        />
      </div>
    </ScreenshotFrame>
  );
}

function renderSqlWhereFilterToolbar() {
  render(
    <ScreenshotFrame>
      <div className="w-[1100px] rounded-2xl border border-border bg-background p-4 text-foreground">
        <DataGridToolbar
          columns={resultColumns}
          filterLogic="and"
          filterRules={[]}
          filterTitle="Filter shipping.carriers"
          isFetching={false}
          onClearSelection={vi.fn()}
          onCopySelection={vi.fn()}
          onExportRows={vi.fn()}
          onExportSelection={vi.fn()}
          onFilterChange={vi.fn()}
          onRefresh={vi.fn()}
          onSortChange={vi.fn()}
          selectedCount={0}
          sortColumns={[]}
        />
      </div>
    </ScreenshotFrame>
  );
}

function renderSortableToolbar() {
  render(
    <ScreenshotFrame>
      <div className="w-[900px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <DataGridToolbar
          columns={sortableColumns}
          filterLogic="and"
          filterRules={[]}
          isFetching={false}
          onClearSelection={vi.fn()}
          onCopySelection={vi.fn()}
          onExportSelection={vi.fn()}
          onFilterChange={vi.fn()}
          onRefresh={vi.fn()}
          onSortChange={vi.fn()}
          selectedCount={0}
          sortColumns={[
            { columnKey: "stat_date", direction: "ASC" },
            { columnKey: "new_customers", direction: "ASC" },
            { columnKey: "page_views", direction: "DESC" },
            { columnKey: "total_revenue", direction: "ASC" },
            { columnKey: "total_orders", direction: "DESC" },
          ]}
        />
      </div>
    </ScreenshotFrame>
  );
}

function renderGridStatusBar() {
  render(
    <ScreenshotFrame>
      <div className="w-[760px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <GridStatusBar
          items={[
            {
              description:
                "Offset pagination can drift while table data changes.",
              id: "offset-pagination",
              label: "Offset pagination",
              tone: "warning",
            },
            {
              description: "Rows do not have a stable backend identity.",
              id: "no-stable-key",
              label: "No stable key",
              tone: "warning",
            },
            {
              description: "The server could not return an exact row count.",
              id: "count-unavailable",
              label: "Count unavailable",
              tone: "muted",
            },
            {
              description: "Read snapshot timestamp returned by the backend.",
              id: "observed-at",
              label: "Observed May 20, 2026, 10:00 AM",
              tone: "info",
            },
          ]}
        />
      </div>
    </ScreenshotFrame>
  );
}

function renderRefreshingGridSurface() {
  render(
    <ScreenshotFrame>
      <div className="w-[720px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <GridSurface busy={true} loading={true}>
          <div className="flex min-h-[400px] items-center justify-center rounded-xl border bg-muted/30 text-muted-foreground text-sm">
            Existing rows stay visible behind the refresh treatment.
          </div>
        </GridSurface>
      </div>
    </ScreenshotFrame>
  );
}

function renderSelectedHeaderEdgeFixture() {
  render(
    <ScreenshotFrame>
      <style>
        {`
          .selected-header-edge-fixture {
            inline-size: 360px;
            block-size: 84px;
          }

          .selected-header-edge-fixture .rdg-header-row {
            display: contents;
          }

          .rounded-selected-header-cell {
            border-start-end-radius: 4px;
            border-end-end-radius: 4px;
          }
        `}
      </style>
      <table className="querylane-data-grid selected-header-edge-fixture">
        <thead>
          <tr className="rdg-header-row">
            <th className="rdg-cell" scope="col">
              name
            </th>
            <th
              aria-selected="true"
              className="rdg-cell rounded-selected-header-cell"
              scope="col"
            >
              created_at
            </th>
          </tr>
        </thead>
      </table>
    </ScreenshotFrame>
  );
}

function renderSelectableDataCellFixture() {
  render(
    <ScreenshotFrame>
      <div className="querylane-data-grid">
        <div className="rdg-header-row">
          <div className="rdg-cell" data-testid="header-cell">
            name
          </div>
        </div>
        <div className="rdg-row">
          <div className="rdg-cell" data-testid="data-cell">
            <span data-testid="data-cell-text">Laptop Pro 15</span>
          </div>
        </div>
      </div>
    </ScreenshotFrame>
  );
}

function renderDataValueDialogGuardFixture() {
  const metadataColumn = column("metadata", "jsonb", DataType.JSON);
  const tagsColumn = column("tags", "text[]", DataType.ARRAY);
  const metadataCell = cell({
    case: "jsonValue",
    value:
      '{"color":"blue","hazmat":false,"dimensions":{"depth":2,"height":2,"width":2}}',
  });
  const tagsCell = cell({
    case: "stringValue",
    value: "{demo,querylane,product,tag-1}",
  });

  render(
    <ScreenshotFrame>
      <DataValueDialogProvider>
        <section className="w-[920px] rounded-2xl border border-border bg-background p-6 text-foreground">
          <h1 className="mb-1 font-semibold text-lg">
            Data value dialog guard
          </h1>
          <p className="mb-4 text-muted-foreground text-sm">
            Expanding a second value keeps the current dialog as the only active
            layer.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0 rounded-lg border bg-card p-3">
              <p className="mb-2 font-medium text-sm">metadata</p>
              <DataCell cell={metadataCell} column={metadataColumn} />
            </div>
            <div className="min-w-0 rounded-lg border bg-card p-3">
              <p className="mb-2 font-medium text-sm">tags</p>
              <DataCell cell={tagsCell} column={tagsColumn} />
            </div>
          </div>
        </section>
      </DataValueDialogProvider>
    </ScreenshotFrame>
  );
}

function renderNarrowColumnHeader() {
  render(
    <ScreenshotFrame>
      <div className="rounded-2xl border border-border bg-background p-6 text-foreground">
        <div
          className="h-9 w-[104px] overflow-hidden rounded-md border border-border"
          data-testid="narrow-column-header"
        >
          <ColumnHeader
            column={column("aggfnoid", "regproc", DataType.STRING)}
            isFrozen={false}
            isPrimaryKey={true}
            onCopyName={vi.fn()}
            onSortAsc={vi.fn()}
            onSortDesc={vi.fn()}
            onToggleFreeze={vi.fn()}
          />
        </div>
      </div>
    </ScreenshotFrame>
  );
}

function getPopoverBox() {
  const popover = document.querySelector<HTMLElement>(
    '[data-slot="popover-content"]'
  );
  if (!popover) {
    throw new Error("expected popover");
  }
  const popoverBox = popover.getBoundingClientRect();

  return {
    bottom: popoverBox.bottom,
    element: popover,
    left: popoverBox.left,
    right: popoverBox.right,
    top: popoverBox.top,
  };
}

test("data explorer controls and row detail drawer expose dense table context", async () => {
  renderDataExplorerSurfaces();

  await expect.element(page.getByText("Data explorer controls")).toBeVisible();
  await expect.element(page.getByText("3 selected")).toBeVisible();
  await expect.element(page.getByText("Page 3 of 6")).toBeVisible();
  await expect.element(page.getByText("public.customers")).toBeVisible();
  await expect.element(page.getByText("PK")).toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-controls-and-row-detail"
  );
});

function renderForeignKeyReferenceGrid(
  className: string,
  targetTableName = carriersName
) {
  seedForeignKeyGridQueries(targetTableName);

  render(
    <ScreenshotFrame>
      <div className={className}>
        <TableDataGrid
          foreignKeyReferences={[
            {
              sourceColumns: ["carrier_id"],
              targetColumns: ["id"],
              targetTableName,
            },
          ]}
          initialPageSize={10}
          name={shipmentsName}
          renderOpenReferencedTableLink={() => (
            <a href="/explorer?schema=public&table=carriers">Open table</a>
          )}
        />
      </div>
    </ScreenshotFrame>
  );
}

async function openForeignKeyReference() {
  const carrierLink = page.getByRole("button", {
    name: "Open carrier_id reference 214",
  });
  await carrierLink.click();
  return carrierLink;
}

test("foreign key reference popover keeps the source table visible", async () => {
  renderForeignKeyReferenceGrid(
    "h-[620px] w-[1120px] rounded-2xl border border-border bg-background p-6 text-foreground"
  );

  const carrierLink = await openForeignKeyReference();
  const carrierLinkStyle = getComputedStyle(carrierLink.element());
  const frameStyle = getComputedStyle(
    page.getByTestId("screenshot-frame").element()
  );
  expect(
    colorContrastRatio(carrierLinkStyle.color, frameStyle.backgroundColor)
  ).toBeGreaterThanOrEqual(4.5);
  await carrierLink.hover();
  const carrierLinkHoverStyle = getComputedStyle(carrierLink.element());
  expect(carrierLinkHoverStyle.opacity).toBe("1");
  expect(carrierLinkHoverStyle.color).not.toBe(frameStyle.color);
  expect(
    colorContrastRatio(carrierLinkHoverStyle.color, frameStyle.backgroundColor)
  ).toBeGreaterThanOrEqual(4.5);

  const preview = page.getByRole("dialog", {
    name: "public.carriers",
  });
  await expect.element(preview).toBeVisible();
  await preview.hover();
  expect(preview.element().dataset["slot"]).toBe("popover-content");
  expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull();
  await expect.element(carrierLink).toBeVisible();
  await expect.element(page.getByText("Hanse Container Line")).toBeVisible();
  const typeMetadata = preview.getByText("int4");
  expect(
    colorContrastRatio(
      getComputedStyle(typeMetadata.element()).color,
      getComputedStyle(preview.element()).backgroundColor
    )
  ).toBeGreaterThanOrEqual(4.5);
  await expect
    .element(page.getByRole("link", { name: "Open table" }))
    .toBeVisible();
  await expect(page).toMatchScreenshot("foreign-key-reference-popover-layout");
});

test("foreign key reference popover fits a narrow viewport", async () => {
  await page.viewport(390, 844);
  try {
    renderForeignKeyReferenceGrid(
      "h-[700px] w-full rounded-xl border border-border bg-background p-3 text-foreground",
      longCarriersName
    );
    await openForeignKeyReference();

    const preview = page.getByRole("dialog", {
      name: `${longSchemaName}.carriers`,
    });
    await expect.element(preview).toBeVisible();
    const previewBox = preview.element().getBoundingClientRect();
    expect(previewBox.left).toBeGreaterThanOrEqual(0);
    expect(previewBox.right).toBeLessThanOrEqual(390);
    const title = preview
      .element()
      .querySelector<HTMLElement>('[data-slot="popover-title"]');
    if (!title) {
      throw new Error("expected popover title");
    }
    expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth);
    await expect(page).toMatchScreenshot(
      "foreign-key-reference-popover-narrow-layout"
    );
  } finally {
    await page.viewport(1280, 1000);
  }
});

test("foreign key query fixtures do not leak into later browser cases", () => {
  expect(
    tableDataApi.useReadRowsQuery({ name: "unrelated-table" })
  ).toBeUndefined();
});

test("data value expansion keeps one visible dialog layer", async () => {
  renderDataValueDialogGuardFixture();

  const metadataExpand = page.getByRole("button", {
    name: "View full JSON for metadata",
  });
  const tagsExpand = page.getByRole("button", {
    name: "View full array for tags",
  });

  await expect.element(metadataExpand).toBeVisible();
  await expect.element(tagsExpand).toBeVisible();
  const tagsExpandElement = tagsExpand.element();
  if (!(tagsExpandElement instanceof HTMLElement)) {
    throw new Error("expected tags expand button");
  }
  await metadataExpand.click();

  const metadataDialog = page.getByRole("dialog", {
    name: "metadata JSON",
  });
  await expect.element(metadataDialog).toBeVisible();

  tagsExpandElement.click();

  await expect
    .element(page.getByRole("dialog", { name: "tags array" }))
    .not.toBeInTheDocument();
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  await expect(metadataDialog).toMatchScreenshot(
    "data-value-dialog-single-layer"
  );
});

test("toolbar shows active sort summary beside the maximize action", async () => {
  render(
    <ScreenshotFrame>
      <div className="w-[1040px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <DataGridToolbar
          columns={resultColumns}
          filterLogic="and"
          filterRules={[]}
          isFetching={false}
          onClearSelection={vi.fn()}
          onCopySelection={vi.fn()}
          onExportSelection={vi.fn()}
          onFilterChange={vi.fn()}
          onRefresh={vi.fn()}
          onSortChange={vi.fn()}
          onToggleExpanded={vi.fn()}
          selectedCount={0}
          sortColumns={[
            { columnKey: "email", direction: "ASC" },
            { columnKey: "last_seen_at", direction: "DESC" },
          ]}
        />
      </div>
    </ScreenshotFrame>
  );

  const maximizeButton = page.getByRole("button", {
    name: "Expand data grid",
  });
  const sortSummary = page.getByRole("group", {
    name: "Active sort summary",
  });

  await expect.element(maximizeButton).toBeVisible();
  await expect.element(sortSummary).toBeVisible();
  await expect.element(sortSummary.getByText("Sort")).toBeVisible();
  await expect
    .element(sortSummary.getByText("email ASC, last_seen_at DESC"))
    .toBeVisible();

  const maximizeBox = maximizeButton.element().getBoundingClientRect();
  const summaryBox = sortSummary.element().getBoundingClientRect();
  expect(summaryBox.left).toBeGreaterThanOrEqual(maximizeBox.right);
});

test("row detail drawer wraps dense catalog fields without visual collisions", async () => {
  renderLongRecordDrawer();

  const title = page.getByRole("heading", {
    name: "information_schema.sql_implementation_info_with_extra_long_suffix",
  });
  const closeButton = page.getByRole("button", { name: "Close" });
  await expect.element(title).toBeVisible();
  await expect.element(closeButton).toBeVisible();
  const titleBox = title.element().getBoundingClientRect();
  const closeBox = closeButton.element().getBoundingClientRect();
  expect(titleBox.right).toBeLessThanOrEqual(closeBox.left - 4);

  const rowNavigation = page.getByRole("group", { name: "Row navigation" });
  await expect
    .element(rowNavigation.getByRole("textbox", { name: "Row number" }))
    .toBeVisible();
  await expect
    .element(rowNavigation.getByRole("button", { name: "Previous row number" }))
    .not.toBeInTheDocument();
  await expect
    .element(rowNavigation.getByRole("button", { name: "Next row number" }))
    .not.toBeInTheDocument();
  await expect
    .element(
      rowNavigation.getByRole("button", { exact: true, name: "Previous row" })
    )
    .toBeVisible();
  await expect
    .element(
      rowNavigation.getByRole("button", { exact: true, name: "Next row" })
    )
    .toBeVisible();

  await expect
    .element(page.getByRole("button", { name: "Copy character_value" }))
    .not.toBeInTheDocument();
  await expect.element(page.getByText("Empty string")).toBeVisible();

  const valueBoxes = Array.from(
    document.querySelectorAll<HTMLElement>('[data-slot="record-field-value"]')
  );
  expect(valueBoxes).toHaveLength(5);
  const widths = valueBoxes.map((box) => box.getBoundingClientRect().width);
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
});

test("data explorer filter controls keep active predicates visible", async () => {
  renderFilteredToolbar();

  await expect.element(page.getByText("Filtered data explorer")).toBeVisible();
  await expect
    .element(page.getByText("email ILIKE %@enterprise%"))
    .toBeVisible();
  await expect.element(page.getByText("active = true")).toBeVisible();
  await expect.element(page.getByText("any")).toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-filter-controls"
  );
});

test("filter popover keeps multiple rules compact and aligned", async () => {
  renderFilteredToolbar();

  await page.getByRole("button", { name: "Filter 2" }).click();
  await expect.element(page.getByText("Filter rows")).toBeVisible();

  const popover = document.querySelector<HTMLElement>(
    '[data-slot="popover-content"]'
  );
  if (!popover) {
    throw new Error("expected filter popover");
  }

  const addFilterBox = page
    .getByRole("button", { name: "Add filter" })
    .element()
    .getBoundingClientRect();
  expect(addFilterBox.width).toBeLessThanOrEqual(140);

  const rows = Array.from(popover.querySelectorAll("li"));
  expect(rows).toHaveLength(2);
  const rowBoxes = rows.map((row) => {
    const triggers = row.querySelectorAll<HTMLElement>(
      '[data-slot="select-trigger"]'
    );
    const valueInput = row.querySelector<HTMLElement>(
      'input[aria-label="Filter value"]'
    );
    const removeButton = row.querySelector<HTMLElement>(
      'button[aria-label="Remove filter"]'
    );
    const columnTrigger = triggers[0];
    const operatorTrigger = triggers[1];
    if (!(columnTrigger && operatorTrigger && valueInput && removeButton)) {
      throw new Error("expected complete filter row controls");
    }
    return {
      column: columnTrigger.getBoundingClientRect(),
      operator: operatorTrigger.getBoundingClientRect(),
      remove: removeButton.getBoundingClientRect(),
      value: valueInput.getBoundingClientRect(),
    };
  });

  const first = rowBoxes[0];
  if (!first) {
    throw new Error("expected filter row boxes");
  }
  for (const rowBox of rowBoxes.slice(1)) {
    expect(rowBox.column.left).toBeCloseTo(first.column.left, 0);
    expect(rowBox.column.width).toBeCloseTo(first.column.width, 0);
    expect(rowBox.operator.left).toBeCloseTo(first.operator.left, 0);
    expect(rowBox.operator.width).toBeCloseTo(first.operator.width, 0);
    expect(rowBox.value.left).toBeCloseTo(first.value.left, 0);
    expect(rowBox.value.width).toBeCloseTo(first.value.width, 0);
    expect(rowBox.remove.left).toBeCloseTo(first.remove.left, 0);
  }
});

test("filter popover starts with an unapplied rule", async () => {
  renderEmptyFilterToolbar();

  await page.getByRole("button", { name: "Filter" }).click();

  await expect
    .element(page.getByRole("combobox", { name: "Filter column" }))
    .toBeVisible();
  await expect.element(page.getByText("No conditions yet")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Add filter" }))
    .toBeVisible();

  const popover = document.querySelector<HTMLElement>(
    '[data-slot="popover-content"]'
  );
  if (!popover) {
    throw new Error("expected Rules filter popover");
  }
  await expect(page.elementLocator(popover)).toMatchScreenshot(
    "data-explorer-rules-filter-popover"
  );
});

test("filter popover exposes SQL WHERE mode", async () => {
  renderSqlWhereFilterToolbar();

  await page.getByRole("button", { name: "Filter" }).click();
  await page.getByRole("tab", { name: "SQL WHERE" }).click();
  await page
    .getByRole("textbox", { name: "SQL WHERE clause" })
    .fill("status = 'customs_hold' AND weight_kg > 10000");

  await expect
    .element(page.getByText("Filter shipping.carriers"))
    .toBeVisible();
  await expect.element(page.getByText(SQL_WHERE_HELP_RE)).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Apply" }))
    .toBeVisible();

  const popover = document.querySelector<HTMLElement>(
    '[data-slot="popover-content"]'
  );
  if (!popover) {
    throw new Error("expected SQL WHERE filter popover");
  }
  await expect(page.elementLocator(popover)).toMatchScreenshot(
    "data-explorer-sql-where-filter-popover"
  );
});

test("page size select shows every option when the footer is near the viewport edge", async () => {
  const onPageSizeChange = vi.fn();

  render(
    <ScreenshotFrame>
      <div className="flex h-[900px] w-[620px] items-end rounded-2xl border border-border bg-background p-6 text-foreground">
        <PaginationFooter
          hasNext={true}
          hasPrev={true}
          onNext={vi.fn()}
          onPageSizeChange={onPageSizeChange}
          onPrev={vi.fn()}
          pageLabel="Page 1"
          pageSize={50}
        />
      </div>
    </ScreenshotFrame>
  );

  await page.getByRole("combobox", { name: "Rows per page" }).click();

  const selectContent = document.querySelector<HTMLElement>(
    '[data-slot="select-content"]'
  );
  if (!selectContent) {
    throw new Error("expected page size select content");
  }
  const contentBox = selectContent.getBoundingClientRect();

  for (const option of ["25", "50", "100", "250", "500"]) {
    const optionBox = page
      .getByRole("option", { exact: true, name: option })
      .element()
      .getBoundingClientRect();
    expect(optionBox.top).toBeGreaterThanOrEqual(contentBox.top);
    expect(optionBox.bottom).toBeLessThanOrEqual(contentBox.bottom);
  }

  await page.getByRole("option", { exact: true, name: "100" }).click();
  expect(onPageSizeChange).toHaveBeenCalledWith(100);
});

test("filter popover stays inside the data-grid boundary when the grid is offset", async () => {
  render(
    <ScreenshotFrame>
      <div className="pl-[320px]">
        <div className="w-[420px] rounded-2xl border border-border bg-background p-6 text-foreground">
          <DataGridToolbar
            columns={resultColumns}
            filterLogic="and"
            filterRules={[
              {
                column: "email",
                id: "filter-email-enterprise",
                operator: "ilike",
                value: "%@enterprise%",
              },
            ]}
            isFetching={false}
            onClearSelection={vi.fn()}
            onCopySelection={vi.fn()}
            onExportSelection={vi.fn()}
            onFilterChange={vi.fn()}
            onRefresh={vi.fn()}
            onSortChange={vi.fn()}
            selectedCount={0}
            sortColumns={[]}
          />
        </div>
      </div>
    </ScreenshotFrame>
  );

  await page.getByRole("button", { name: "Filter 1" }).click();

  const boundary = document.querySelector<HTMLElement>(
    "[data-slot='data-grid-popover-boundary']"
  );
  if (!boundary) {
    throw new Error("expected data-grid popover boundary");
  }
  const boundaryBox = boundary.getBoundingClientRect();
  const popoverBox = getPopoverBox();
  expect(boundary.contains(popoverBox.element)).toBe(false);
  expect(popoverBox.left).toBeGreaterThanOrEqual(boundaryBox.left - 1);
  expect(popoverBox.right).toBeLessThanOrEqual(boundaryBox.right + 1);
});

test("sort popover keeps every row control aligned", async () => {
  renderSortableToolbar();

  await page.getByRole("button", { name: "Sort 5" }).click();
  await expect.element(page.getByText("Sort by")).toBeVisible();

  const popover = document.querySelector<HTMLElement>(
    '[data-slot="popover-content"]'
  );
  if (!popover) {
    throw new Error("expected sort popover");
  }

  const rows = Array.from(popover.querySelectorAll("li"));
  expect(rows).toHaveLength(5);
  const rowBoxes = rows.map((row) => {
    const triggers = row.querySelectorAll<HTMLElement>(
      '[data-slot="select-trigger"]'
    );
    expect(triggers).toHaveLength(2);
    const columnTrigger = triggers[0];
    const directionTrigger = triggers[1];
    if (!(columnTrigger && directionTrigger)) {
      throw new Error("expected sort row controls");
    }
    return {
      column: columnTrigger.getBoundingClientRect(),
      direction: directionTrigger.getBoundingClientRect(),
      row: row.getBoundingClientRect(),
    };
  });

  for (const rowBox of rowBoxes) {
    expect(rowBox.column.width).toBeGreaterThan(80);
    expect(rowBox.direction.width).toBeGreaterThan(60);
    expect(rowBox.column.left).toBeGreaterThan(rowBox.row.left);
    expect(rowBox.direction.left).toBeGreaterThan(rowBox.column.left);
    expect(rowBox.direction.right).toBeLessThanOrEqual(rowBox.row.right + 1);
  }
});

test("sort popover stays inside the data-grid boundary when the grid is offset", async () => {
  render(
    <ScreenshotFrame>
      <div className="pl-[320px]">
        <div className="w-[560px] rounded-2xl border border-border bg-background p-6 text-foreground">
          <DataGridToolbar
            columns={sortableColumns}
            filterLogic="and"
            filterRules={[]}
            isFetching={false}
            onClearSelection={vi.fn()}
            onCopySelection={vi.fn()}
            onExportSelection={vi.fn()}
            onFilterChange={vi.fn()}
            onRefresh={vi.fn()}
            onSortChange={vi.fn()}
            selectedCount={0}
            sortColumns={[
              { columnKey: "stat_date", direction: "ASC" },
              { columnKey: "new_customers", direction: "ASC" },
              { columnKey: "page_views", direction: "DESC" },
            ]}
          />
        </div>
      </div>
    </ScreenshotFrame>
  );

  await page.getByRole("button", { name: "Sort 3" }).click();

  const boundary = document.querySelector<HTMLElement>(
    "[data-slot='data-grid-popover-boundary']"
  );
  if (!boundary) {
    throw new Error("expected data-grid popover boundary");
  }
  const boundaryBox = boundary.getBoundingClientRect();
  const popoverBox = getPopoverBox();
  expect(boundary.contains(popoverBox.element)).toBe(false);
  expect(popoverBox.left).toBeGreaterThanOrEqual(boundaryBox.left - 1);
  expect(popoverBox.right).toBeLessThanOrEqual(boundaryBox.right + 1);
});

test("grid status bar exposes backend metadata labels as visible UI", async () => {
  renderGridStatusBar();

  const status = page.getByRole("status", { name: "Grid status" });
  await expect.element(status).toBeVisible();
  await expect.element(status.getByText("Offset pagination")).toBeVisible();
  await expect.element(status.getByText("No stable key")).toBeVisible();
  await expect.element(status.getByText("Count unavailable")).toBeVisible();
  await expect
    .element(status.getByText("Observed May 20, 2026, 10:00 AM"))
    .toBeVisible();
});

test("data grid refresh treatment is centered and readable", async () => {
  renderRefreshingGridSurface();

  const surfaceLocator = page.getByTestId("grid-refresh-surface");
  await expect.element(surfaceLocator).toBeVisible();
  const surface = surfaceLocator.element();
  const status = page.getByRole("status", { name: "Refreshing data" });
  await expect.element(status).toBeVisible();
  await expect.element(status.getByText("Refreshing rows…")).toBeVisible();
  await expect
    .element(status.getByText("Re-evaluating the visible data set."))
    .toBeVisible();

  const surfaceBox = surface.getBoundingClientRect();
  const statusBox = status.element().getBoundingClientRect();
  const surfaceCenterX = surfaceBox.left + surfaceBox.width / 2;
  const surfaceCenterY = surfaceBox.top + surfaceBox.height / 2;
  const statusCenterX = statusBox.left + statusBox.width / 2;
  const statusCenterY = statusBox.top + statusBox.height / 2;

  expect(statusBox.width).toBeGreaterThan(260);
  expect(statusBox.height).toBeGreaterThan(72);
  expect(Math.abs(statusCenterX - surfaceCenterX)).toBeLessThan(2);
  expect(Math.abs(statusCenterY - surfaceCenterY)).toBeLessThan(2);
});

test("selected edge header cell keeps a continuous square border", async () => {
  renderSelectedHeaderEdgeFixture();

  const createdHeader = page.getByText("created_at");
  await expect.element(createdHeader).toBeVisible();
  const selectedHeader = createdHeader.element();
  const selectedHeaderStyle = getComputedStyle(selectedHeader);
  expect(selectedHeaderStyle.borderTopRightRadius).toBe("0px");
  expect(selectedHeaderStyle.borderBottomRightRadius).toBe("0px");

  const grid = document.querySelector<HTMLElement>(".querylane-data-grid");
  if (!grid) {
    throw new Error("expected grid fixture");
  }
  expect(getComputedStyle(grid).contain).not.toContain("paint");
});

test("data grid scrollbars use theme colors in dark mode", async () => {
  renderSelectedHeaderEdgeFixture();
  document.documentElement.classList.add("dark");
  try {
    const createdHeader = page.getByText("created_at");
    await expect.element(createdHeader).toBeVisible();

    const grid = createdHeader
      .element()
      .closest<HTMLElement>(".querylane-data-grid");
    if (!grid) {
      throw new Error("expected grid fixture");
    }
    const style = getComputedStyle(grid);

    expect(style.scrollbarColor).toContain("oklch");
    expect(style.scrollbarWidth).toBe("thin");
    expect(style.getPropertyValue("--querylane-scrollbar-thumb")).not.toBe("");
    expect(style.getPropertyValue("--querylane-scrollbar-track")).not.toBe("");
  } finally {
    document.documentElement.classList.remove("dark");
  }
});

test("data grid values remain selectable while headers stay non-selectable", async () => {
  renderSelectableDataCellFixture();

  const dataCell = page.getByTestId("data-cell");
  const dataCellText = page.getByTestId("data-cell-text");
  const headerCell = page.getByTestId("header-cell");
  await expect.element(dataCellText).toBeVisible();

  expect(getComputedStyle(dataCell.element()).userSelect).toBe("text");
  expect(getComputedStyle(dataCellText.element()).userSelect).toBe("text");
  expect(getComputedStyle(dataCell.element()).cursor).toBe("default");
  expect(getComputedStyle(headerCell.element()).userSelect).toBe("none");
});

test("narrow column headers keep the options menu visible", async () => {
  renderNarrowColumnHeader();

  const header = page.getByTestId("narrow-column-header");
  const menuButton = page.getByRole("button", {
    name: "Open options for column aggfnoid",
  });
  await expect.element(menuButton).toBeVisible();

  const headerBox = header.element().getBoundingClientRect();
  const buttonBox = menuButton.element().getBoundingClientRect();

  expect(buttonBox.left).toBeGreaterThanOrEqual(headerBox.left);
  expect(buttonBox.right).toBeLessThanOrEqual(headerBox.right);

  await menuButton.click();
  await expect.element(page.getByText("Sort ascending")).toBeVisible();

  const menu = document.querySelector<HTMLElement>(
    '[data-slot="dropdown-menu-content"]'
  );
  if (!menu) {
    throw new Error("expected column menu");
  }
  expect(menu.textContent).toContain("regproc");
});
