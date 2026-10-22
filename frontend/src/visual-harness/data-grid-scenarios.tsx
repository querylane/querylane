import { type ComponentProps, useState } from "react";
import { DataCell } from "@/components/data-grid/table-data-grid/data-cell";
import { DataGridToolbar } from "@/components/data-grid/table-data-grid/data-grid-toolbar";
import { DataValueDialogProvider } from "@/components/data-grid/table-data-grid/data-value-dialog-provider";
import { PaginationFooter } from "@/components/data-grid/table-data-grid/pagination-footer";
import { RecordDetailDrawer } from "@/components/data-grid/table-data-grid/record-detail-drawer";
import {
  DataTable,
  type DataTableColumnDef,
  SortableHeader,
} from "@/components/ui/data-table";
import { DataTableFilterToolbar } from "@/components/ui/data-table-filter-toolbar";
import { StatusIndicator } from "@/components/ui/status-indicator";
import type { TableResultColumn } from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import {
  CELL_GALLERY_EXAMPLES,
  CUSTOMER_COLUMNS,
  CUSTOMER_RECORD_CELLS,
  DATA_TABLE_ROWS,
  type DataTableFixtureRow,
  DIALOG_GUARD_METADATA_CELL,
  DIALOG_GUARD_METADATA_COLUMN,
  DIALOG_GUARD_TAGS_CELL,
  DIALOG_GUARD_TAGS_COLUMN,
  ENTERPRISE_FILTER_RULES,
  NEGATED_REGEX_FILTER_RULES,
} from "@/visual-harness/data-grid-scenario-data";
import { HarnessProviders } from "@/visual-harness/harness-providers";

import "@/components/data-grid/table-data-grid/data-grid-theme.css";

// Isolated data grid and data table states shared by rstest behavior tests
// and the Playwright visual harness, so both runners exercise identical markup.

function ignoreAction() {
  return undefined;
}

type ToolbarProps = ComponentProps<typeof DataGridToolbar>;

function toolbarProps(
  columns: TableResultColumn[],
  overrides: Partial<ToolbarProps> = {}
): ToolbarProps {
  return {
    columnOrder: columns.map((resultColumn) => resultColumn.columnName),
    columns,
    fetchVisibleColumns: false,
    filterLogic: "and",
    filterRules: [],
    hiddenColumnKeys: new Set<string>(),
    isColumnLayoutCustomized: false,
    isFetching: false,
    onClearSelection: ignoreAction,
    onColumnLayoutReset: ignoreAction,
    onColumnOrderChange: ignoreAction,
    onColumnVisibilityChange: ignoreAction,
    onCopySelection: ignoreAction,
    onExportSelection: ignoreAction,
    onFetchVisibleColumnsChange: ignoreAction,
    onFilterChange: ignoreAction,
    onRefresh: ignoreAction,
    onSortChange: ignoreAction,
    selectedCount: 0,
    sortColumns: [],
    ...overrides,
  };
}

function DataExplorerControlsScenario() {
  return (
    <div className="border-border bg-background text-foreground w-[1120px] rounded-2xl border p-6">
      <section className="border-border bg-card rounded-xl border p-4">
        <div className="mb-3">
          <h1 className="text-xl font-semibold">Data explorer controls</h1>
          <p className="text-muted-foreground text-sm">
            Selection, sorting, refresh, row counts, and pagination must stay
            compact while the data area scales.
          </p>
        </div>
        <DataGridToolbar
          {...toolbarProps(CUSTOMER_COLUMNS, {
            filterRules: ENTERPRISE_FILTER_RULES,
            isFetching: true,
            selectedCount: 3,
            sortColumns: [
              { columnKey: "email", direction: "ASC" },
              { columnKey: "last_seen_at", direction: "DESC" },
            ],
          })}
        />
        <div className="border-border bg-muted/20 mt-4 rounded-lg border p-3">
          <PaginationFooter
            hasNext={true}
            hasPrev={true}
            onNext={ignoreAction}
            onPageSizeChange={ignoreAction}
            onPrev={ignoreAction}
            pageLabel="Page 3 of 6"
            pageSize={25}
          />
        </div>
      </section>
    </div>
  );
}

// The drawer is a modal sheet, so it gets its own scenario instead of
// dimming the toolbar screenshot behind its backdrop.
function RecordDetailDrawerScenario() {
  return (
    <HarnessProviders>
      <RecordDetailDrawer
        columns={CUSTOMER_COLUMNS}
        hasNext={true}
        hasPrev={false}
        name="instances/prod/databases/app/schemas/public/tables/customers"
        onNext={ignoreAction}
        onOpenChange={ignoreAction}
        onPrev={ignoreAction}
        onRowIndexChange={ignoreAction}
        open={true}
        pkColumnSet={new Set(["id"])}
        rowCells={CUSTOMER_RECORD_CELLS}
        rowCount={2}
        rowIndex={0}
        tableName={{ schema: "public", table: "customers" }}
      />
    </HarnessProviders>
  );
}

function DataGridFilteredToolbarScenario() {
  return (
    <div className="border-border bg-background text-foreground w-[900px] rounded-2xl border p-6">
      <section className="border-border bg-card rounded-xl border p-4">
        <div className="mb-3">
          <h1 className="text-xl font-semibold">Filtered data explorer</h1>
          <p className="text-muted-foreground text-sm">
            Active server-side filters stay visible beside sort and refresh
            controls.
          </p>
        </div>
        <DataGridToolbar
          {...toolbarProps(CUSTOMER_COLUMNS, {
            filterLogic: "or",
            filterRules: ENTERPRISE_FILTER_RULES,
            sortColumns: [{ columnKey: "last_seen_at", direction: "DESC" }],
          })}
        />
      </section>
    </div>
  );
}

function DataGridEmptyFilterToolbarScenario() {
  return (
    <div className="border-border bg-background text-foreground w-[900px] rounded-2xl border p-6">
      <DataGridToolbar
        {...toolbarProps(CUSTOMER_COLUMNS, {
          filterTitle: "Filter shipping.carriers",
        })}
      />
    </div>
  );
}

function DataGridAdvancedFilterToolbarScenario() {
  return (
    <div className="border-border bg-background text-foreground w-[900px] rounded-2xl border p-6">
      <DataGridToolbar
        {...toolbarProps(CUSTOMER_COLUMNS, {
          filterRules: NEGATED_REGEX_FILTER_RULES,
        })}
      />
    </div>
  );
}

function DataGridColumnProjectionToolbarScenario() {
  return (
    <div className="border-border bg-background text-foreground w-[900px] rounded-2xl border p-6">
      <DataGridToolbar
        {...toolbarProps(CUSTOMER_COLUMNS, {
          fetchVisibleColumns: true,
          hiddenColumnKeys: new Set(["metadata"]),
          isColumnLayoutCustomized: true,
        })}
      />
    </div>
  );
}

function DataGridOffsetFilterToolbarScenario() {
  return (
    <div className="pl-80">
      <div className="border-border bg-background text-foreground w-[420px] rounded-2xl border p-6">
        <DataGridToolbar
          {...toolbarProps(CUSTOMER_COLUMNS, {
            filterRules: ENTERPRISE_FILTER_RULES.slice(0, 1),
          })}
        />
      </div>
    </div>
  );
}

function DataValueDialogGuardScenario() {
  return (
    <DataValueDialogProvider>
      <section className="border-border bg-background text-foreground w-[920px] rounded-2xl border p-6">
        <h1 className="mb-1 text-lg font-semibold">Data value dialog guard</h1>
        <p className="text-muted-foreground mb-4 text-sm">
          Expanding a second value keeps the current dialog as the only active
          layer.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card min-w-0 rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium">metadata</p>
            <DataCell
              cell={DIALOG_GUARD_METADATA_CELL}
              column={DIALOG_GUARD_METADATA_COLUMN}
            />
          </div>
          <div className="bg-card min-w-0 rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium">tags</p>
            <DataCell
              cell={DIALOG_GUARD_TAGS_CELL}
              column={DIALOG_GUARD_TAGS_COLUMN}
            />
          </div>
        </div>
      </section>
    </DataValueDialogProvider>
  );
}

function DataCellGalleryScenario() {
  return (
    <div className="border-border bg-background text-foreground w-[1100px] rounded-2xl border p-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Data cell rendering</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Typed PostgreSQL values should stay aligned, scannable, and visibly
            distinct.
          </p>
        </div>
        <div className="border-border overflow-hidden rounded-xl border">
          <div className="border-border bg-muted/30 text-muted-foreground grid grid-cols-[180px_minmax(0,1fr)] border-b px-4 py-3 text-xs font-medium tracking-wide uppercase">
            <div>Type</div>
            <div>Rendered value</div>
          </div>
          {CELL_GALLERY_EXAMPLES.map((example) => (
            <div
              className="border-border grid grid-cols-[180px_minmax(0,1fr)] items-center border-b px-4 py-3 last:border-b-0"
              key={example.column.columnName}
            >
              <div className="text-muted-foreground text-sm">
                {example.column.columnName}
              </div>
              <div className="bg-card flex min-w-0 items-center rounded-md px-3 py-2 text-left text-sm">
                <DataCell
                  cell={example.cell}
                  column={example.column}
                  jsonDisplay="expanded"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="border-border bg-card flex gap-4 rounded-xl border p-4 text-sm">
          <StatusIndicator status="connected" />
          <StatusIndicator status="disconnected" />
          <StatusIndicator status="error" />
        </div>
      </div>
    </div>
  );
}

const DATA_TABLE_COLUMNS: DataTableColumnDef<DataTableFixtureRow>[] = [
  {
    accessorKey: "name",
    cell: ({ row }) => row.original.name,
    header: ({ column }) => (
      <SortableHeader column={column}>Instance</SortableHeader>
    ),
  },
  {
    accessorKey: "owner",
    cell: ({ row }) => row.original.owner,
    header: "Owner",
  },
  {
    accessorKey: "status",
    cell: ({ row }) => row.original.status,
    header: "Status",
  },
];

function DataTableSurface({
  filterValue,
  initialSorting,
}: {
  filterValue?: string;
  initialSorting?: Array<{ desc: boolean; id: string }>;
}) {
  const controlledFilterProps =
    filterValue === undefined
      ? {}
      : { filterValue, onFilterChange: ignoreAction };
  const initialSortingProps =
    initialSorting === undefined ? {} : { initialSorting };

  return (
    <div className="border-border bg-background text-foreground w-[760px] rounded-xl border p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold">Database instances</h2>
        <p className="text-muted-foreground text-sm">
          Visual fixture for metadata table sorting, filtering, and pagination.
        </p>
      </div>
      <DataTable
        columns={DATA_TABLE_COLUMNS}
        data={DATA_TABLE_ROWS}
        filterColumn="name"
        filterPlaceholder="Filter instances..."
        {...controlledFilterProps}
        {...initialSortingProps}
      />
    </div>
  );
}

function DataTableDefaultScenario() {
  return <DataTableSurface />;
}

function DataTableSortedFilteredScenario() {
  return (
    <DataTableSurface
      filterValue="a"
      initialSorting={[{ desc: false, id: "name" }]}
    />
  );
}

function DataTableActiveFilterToolbarScenario() {
  const [searchValue, setSearchValue] = useState("customer");
  const [kind, setKind] = useState(["regular"]);
  const [owner, setOwner] = useState(["analytics"]);

  function clearAll() {
    setSearchValue("");
    setKind([]);
    setOwner([]);
  }

  return (
    <div
      className="border-border bg-card w-[760px] rounded-lg border p-4"
      data-testid="filter-toolbar-visual"
    >
      <DataTableFilterToolbar
        facets={[
          {
            label: "Kind",
            onChange: setKind,
            options: [
              { count: 3, label: "Regular", value: "regular" },
              { count: 1, label: "Template", value: "template" },
            ],
            selected: kind,
            singleSelect: true,
          },
          {
            label: "Owner",
            onChange: setOwner,
            options: [
              { count: 2, label: "analytics", value: "analytics" },
              { count: 1, label: "postgres", value: "postgres" },
            ],
            selected: owner,
          },
        ]}
        onClearAll={clearAll}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search databases..."
        searchValue={searchValue}
      />
    </div>
  );
}

export {
  DataCellGalleryScenario,
  DataExplorerControlsScenario,
  DataGridAdvancedFilterToolbarScenario,
  DataGridColumnProjectionToolbarScenario,
  DataGridEmptyFilterToolbarScenario,
  DataGridFilteredToolbarScenario,
  DataGridOffsetFilterToolbarScenario,
  DataTableActiveFilterToolbarScenario,
  DataTableDefaultScenario,
  DataTableSortedFilteredScenario,
  DataValueDialogGuardScenario,
  RecordDetailDrawerScenario,
};
