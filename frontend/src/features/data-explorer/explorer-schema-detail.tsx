import {
  Database as DatabaseIcon,
  Eye,
  FolderTree,
  Table2,
  X,
} from "lucide-react";
import { useDeferredValue, useState } from "react";
import { CatalogKindBadge } from "@/components/console-pages/catalog-object-badge";
import {
  catalogObjectKindValue,
  presentCatalogObjectKindOptions,
} from "@/components/console-pages/database-overview-filters";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumnDef,
  DataTableFilter,
  SortableHeader,
} from "@/components/ui/data-table";
import {
  DataTableFacetedFilter,
  type FacetedFilterOption,
} from "@/components/ui/data-table-faceted-filter";
import { Skeleton } from "@/components/ui/skeleton";
import { CatalogSyncNotice } from "@/features/data-explorer/catalog-sync-notice";
import { HeaderStat } from "@/features/data-explorer/explorer-shared-ui";
import { formatRows } from "@/features/data-explorer/format-rows";
import type { catalogSyncNotice } from "@/features/data-explorer/use-data-explorer-state";
import {
  formatBytes,
  normalizeEstimatedRowCount,
  parseResourceLeafId,
} from "@/lib/console-resources";
import {
  type Table,
  Table_TableType,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  type View,
  View_ViewType,
} from "@/protogen/querylane/console/v1alpha1/view_pb";

const ZERO_BYTES = BigInt(0);
const ZERO_ROWS = BigInt(0);
const OBJECTS_PAGE_SIZE = 15;
const EM_DASH = "—";
const NO_OWNER_FILTER_LABEL = "No owner";

// A unified row for the schema inventory: tables and views projected onto one
// shape so a single faceted, sortable table can present both kinds.
interface SchemaObjectRow {
  comment: string;
  displayName: string;
  isMaterialized: boolean;
  isPopulated: boolean;
  isSystem: boolean;
  kind: "table" | "view";
  owner: string;
  resourceName: string;
  rowCount: bigint;
  sizeBytes: bigint;
  tableType: Table_TableType;
}

function toTableRow(table: Table): SchemaObjectRow {
  return {
    comment: table.comment,
    displayName: table.displayName,
    isMaterialized: false,
    isPopulated: true,
    isSystem: table.isSystemTable,
    kind: "table",
    owner: table.owner,
    // Selection keys on the bare display name (see ExplorerDetailPane's
    // selectedTable lookup), never the full resource path.
    resourceName: table.displayName || parseResourceLeafId(table.name),
    rowCount: table.rowCount,
    sizeBytes: table.sizeBytes,
    tableType: table.tableType,
  };
}

function toViewRow(view: View): SchemaObjectRow {
  return {
    comment: view.comment,
    displayName: view.displayName,
    isMaterialized: view.viewType === View_ViewType.MATERIALIZED,
    isPopulated: view.isPopulated,
    isSystem: view.isSystemView,
    kind: "view",
    owner: view.owner,
    resourceName: view.displayName || parseResourceLeafId(view.name),
    rowCount: view.rowCount,
    sizeBytes: view.sizeBytes,
    tableType: Table_TableType.UNSPECIFIED,
  };
}

function countStat(count: number, hasMore: boolean): string {
  return hasMore ? `${count.toLocaleString()}+` : count.toLocaleString();
}

function lowerBoundStat(formatted: string, hasMore: boolean): string {
  return hasMore ? `≥ ${formatted}` : formatted;
}

function schemaObjectIcon(row: SchemaObjectRow) {
  if (row.kind === "view") {
    return Eye;
  }
  if (row.tableType === Table_TableType.PARTITIONED) {
    return FolderTree;
  }
  return Table2;
}

function ObjectNameCell({ row }: { row: SchemaObjectRow }) {
  const Icon = schemaObjectIcon(row);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground"
      />
      <span className="truncate font-mono text-[13px]">{row.displayName}</span>
    </span>
  );
}

function schemaObjectColumns(): DataTableColumnDef<SchemaObjectRow>[] {
  return [
    {
      accessorFn: (row) => row.displayName,
      cell: ({ row }) => <ObjectNameCell row={row.original} />,
      filterFn: "includesString",
      header: ({ column }) => (
        <SortableHeader column={column}>Name</SortableHeader>
      ),
      id: "name",
    },
    {
      accessorFn: (row) => row.kind,
      cell: ({ row }) => (
        <CatalogKindBadge
          isMaterialized={row.original.isMaterialized}
          isPopulated={row.original.isPopulated}
          isSystem={row.original.isSystem}
          kind={row.original.kind}
          tableType={row.original.tableType}
        />
      ),
      header: ({ column }) => (
        <SortableHeader column={column}>Kind</SortableHeader>
      ),
      id: "kind",
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorFn: (row) => Number(row.sizeBytes),
      cell: ({ row }) => formatBytes(row.original.sizeBytes),
      header: ({ column }) => (
        <SortableHeader className="ml-auto" column={column}>
          Size
        </SortableHeader>
      ),
      id: "size",
      meta: {
        cellClassName: "text-right font-mono text-xs tabular-nums",
        headerClassName: "text-right",
      },
    },
    {
      accessorFn: (row) => Number(row.rowCount),
      cell: ({ row }) =>
        row.original.kind === "view" && row.original.rowCount === ZERO_ROWS
          ? EM_DASH
          : formatRows(normalizeEstimatedRowCount(row.original.rowCount)),
      header: ({ column }) => (
        <SortableHeader className="ml-auto" column={column}>
          Rows
        </SortableHeader>
      ),
      id: "rows",
      meta: {
        cellClassName: "text-right font-mono text-xs tabular-nums",
        headerClassName: "text-right",
      },
    },
    {
      accessorFn: (row) => row.owner,
      cell: ({ row }) =>
        row.original.owner ? (
          <span className="font-mono text-muted-foreground text-xs">
            {row.original.owner}
          </span>
        ) : (
          <span className="text-muted-foreground">{EM_DASH}</span>
        ),
      header: ({ column }) => (
        <SortableHeader column={column}>Owner</SortableHeader>
      ),
      id: "owner",
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorFn: (row) => row.comment,
      cell: ({ row }) =>
        row.original.comment ? (
          <span className="block truncate text-muted-foreground text-xs">
            {row.original.comment}
          </span>
        ) : (
          <span className="text-muted-foreground">{EM_DASH}</span>
        ),
      header: ({ column }) => (
        <SortableHeader column={column}>Comment</SortableHeader>
      ),
      id: "comment",
      meta: { cellClassName: "max-w-[20rem] truncate" },
    },
  ];
}

function presentKindOptions(rows: SchemaObjectRow[]): FacetedFilterOption[] {
  return presentCatalogObjectKindOptions(rows);
}

function ownerFilterLabel(owner: string): string {
  return owner || NO_OWNER_FILTER_LABEL;
}

function presentOwnerOptions(rows: SchemaObjectRow[]): FacetedFilterOption[] {
  return Array.from(new Set(rows.map((row) => row.owner)))
    .sort((left, right) =>
      ownerFilterLabel(left).localeCompare(ownerFilterLabel(right))
    )
    .map((owner) => ({ label: ownerFilterLabel(owner), value: owner }));
}

function filterSchemaObjectRows({
  kindFilters,
  ownerFilters,
  rows,
}: {
  kindFilters: string[];
  ownerFilters: string[];
  rows: SchemaObjectRow[];
}): SchemaObjectRow[] {
  const selectedKinds = new Set(kindFilters);
  const selectedOwners = new Set(ownerFilters);
  return rows.filter(
    (row) =>
      (selectedKinds.size === 0 ||
        selectedKinds.has(catalogObjectKindValue(row))) &&
      (selectedOwners.size === 0 || selectedOwners.has(row.owner))
  );
}

function SchemaObjectFilterBar({
  kindFilters,
  kindOptions,
  onKindFiltersChange,
  onOwnerFiltersChange,
  ownerFilters,
  ownerOptions,
}: {
  kindFilters: string[];
  kindOptions: FacetedFilterOption[];
  onKindFiltersChange: (values: string[]) => void;
  onOwnerFiltersChange: (values: string[]) => void;
  ownerFilters: string[];
  ownerOptions: FacetedFilterOption[];
}) {
  const filters = [
    {
      handleSelectedValuesChange: onKindFiltersChange,
      label: "Kind",
      options: kindOptions,
      selectedValues: kindFilters,
    },
    {
      handleSelectedValuesChange: onOwnerFiltersChange,
      label: "Owner",
      options: ownerOptions,
      selectedValues: ownerFilters,
    },
  ].filter((filter) => filter.options.length > 0);
  const hasActiveFilter = filters.some(
    (filter) => filter.selectedValues.length > 0
  );

  if (filters.length === 0) {
    return null;
  }

  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-2"
      data-slot="schema-object-filter-bar"
    >
      {filters.map((filter) => (
        <DataTableFacetedFilter
          key={filter.label}
          onSelectedValuesChange={filter.handleSelectedValuesChange}
          options={filter.options}
          selectedValues={filter.selectedValues}
          title={filter.label}
        />
      ))}
      {hasActiveFilter ? (
        <Button
          className="h-8 px-2 text-xs"
          onClick={() => {
            for (const filter of filters) {
              filter.handleSelectedValuesChange([]);
            }
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <X data-icon="inline-start" />
          Reset
        </Button>
      ) : null}
    </div>
  );
}

function SchemaObjectsTable({
  onSelectTable,
  onSelectView,
  tables,
  views,
}: {
  onSelectTable: (name: string) => void;
  onSelectView: (name: string) => void;
  tables: Table[];
  views: View[];
}) {
  const [kindFilters, setKindFilters] = useState<string[]>([]);
  const [ownerFilters, setOwnerFilters] = useState<string[]>([]);
  // Schema overview search/facets are detail-scoped inventory controls, not
  // resource identity. Keep them local so the Data Explorer URL stays focused
  // on schema/category/name/q and header counts remain based on loaded pages.
  const [search, setSearch] = useState("");
  // Keep the input urgent while deferring the table re-filter for responsive
  // typing on large schemas.
  const deferredSearch = useDeferredValue(search);

  const rows = [...tables.map(toTableRow), ...views.map(toViewRow)];
  const visibleRows = filterSchemaObjectRows({
    kindFilters,
    ownerFilters,
    rows,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-8 flex-wrap items-center justify-start gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <DataTableFilter
            onChange={setSearch}
            placeholder="Search objects…"
            value={search}
          />
          <SchemaObjectFilterBar
            kindFilters={kindFilters}
            kindOptions={presentKindOptions(rows)}
            onKindFiltersChange={setKindFilters}
            onOwnerFiltersChange={setOwnerFilters}
            ownerFilters={ownerFilters}
            ownerOptions={presentOwnerOptions(rows)}
          />
        </div>
      </div>
      <DataTable
        columns={schemaObjectColumns()}
        data={visibleRows}
        emptyResourceName="objects"
        filterColumn="name"
        filterValue={deferredSearch}
        initialSorting={[{ desc: true, id: "size" }]}
        onFilterChange={setSearch}
        onRowClick={(row) =>
          row.kind === "table"
            ? onSelectTable(row.resourceName)
            : onSelectView(row.resourceName)
        }
        pageSize={OBJECTS_PAGE_SIZE}
        tableKey="schema-objects"
      />
    </div>
  );
}

const LOADING_SKELETON_KEYS = Array.from(
  { length: 8 },
  (_, index) => `schema-object-skeleton-${index + 1}`
);

function SchemaObjectsLoading() {
  return (
    <div
      aria-label="Loading objects"
      className="flex flex-col gap-2 rounded-lg border border-border p-3"
      role="status"
    >
      <span className="sr-only">Loading objects</span>
      {LOADING_SKELETON_KEYS.map((key) => (
        <Skeleton aria-hidden="true" className="h-7 w-full" key={key} />
      ))}
    </div>
  );
}

function SchemaDetail({
  hasMoreTables = false,
  hasMoreViews = false,
  onSelectTable,
  onSelectView,
  owner,
  schemaName,
  tables,
  tablesError,
  tablesLoading,
  tablesSyncNotice,
  views,
  viewsError,
  viewsLoading,
}: {
  hasMoreTables?: boolean;
  hasMoreViews?: boolean;
  onSelectTable: (name: string) => void;
  onSelectView: (name: string) => void;
  owner: string;
  schemaName: string;
  tables: Table[];
  tablesError: unknown;
  tablesLoading: boolean;
  tablesSyncNotice?: ReturnType<typeof catalogSyncNotice>;
  views: View[];
  viewsError: unknown;
  viewsLoading: boolean;
}) {
  // The API has no schema-level aggregates, so stats cover the loaded catalog
  // pages only. When more pages exist they render as lower bounds ("12+",
  // "≥ 1.2 GB") instead of pretending to be exact.
  const totalSizeBytes =
    tables.reduce((sum, table) => sum + table.sizeBytes, ZERO_BYTES) +
    views.reduce((sum, view) => sum + view.sizeBytes, ZERO_BYTES);
  const totalRows = tables.reduce(
    (sum, table) => sum + normalizeEstimatedRowCount(table.rowCount),
    0
  );
  const isLoading =
    (tablesLoading || viewsLoading) &&
    tables.length === 0 &&
    views.length === 0 &&
    !(tablesError || viewsError);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <DatabaseIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
              Schema
            </p>
            <h1 className="truncate font-mono font-semibold text-xl">
              {schemaName}
            </h1>
            {owner ? (
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                owner: {owner}
              </p>
            ) : null}
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto sm:shrink-0 sm:items-center sm:gap-5">
          <HeaderStat
            label="Tables"
            loading={isLoading}
            value={countStat(tables.length, hasMoreTables)}
          />
          <HeaderStat
            label="Views"
            loading={isLoading}
            value={countStat(views.length, hasMoreViews)}
          />
          <HeaderStat
            label="Total size"
            loading={isLoading}
            value={lowerBoundStat(formatBytes(totalSizeBytes), hasMoreTables)}
          />
          <HeaderStat
            label="Estimated rows"
            loading={isLoading}
            value={lowerBoundStat(formatRows(totalRows), hasMoreTables)}
          />
        </div>
      </header>

      {tablesSyncNotice ? (
        <CatalogSyncNotice notice={tablesSyncNotice} surface="detail" />
      ) : null}

      {tablesError || viewsError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
          Failed to load some objects in this schema. Refresh the page to try
          again.
        </div>
      ) : null}

      {isLoading ? (
        <SchemaObjectsLoading />
      ) : (
        <SchemaObjectsTable
          onSelectTable={onSelectTable}
          onSelectView={onSelectView}
          tables={tables}
          views={views}
        />
      )}
    </div>
  );
}

export { SchemaDetail };
