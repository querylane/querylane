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
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { CatalogSyncNotice } from "@/features/data-explorer/catalog-sync-notice";
import type { SchemaSummary } from "@/features/data-explorer/data-explorer-model";
import { ExplorerSchemaMap } from "@/features/data-explorer/explorer-schema-map";
import { HeaderStat } from "@/features/data-explorer/explorer-shared-ui";
import { formatRows } from "@/features/data-explorer/format-rows";
import {
  ObjectDetailHeader,
  ObjectDetailTabsBar,
  ObjectDetailTabTrigger,
} from "@/features/data-explorer/object-detail-chrome";
import { OBJECT_DETAIL_PANEL_PADDED_CLASS } from "@/features/data-explorer/object-detail-panel-classes";
import type { SchemaDetailTab } from "@/features/data-explorer/schema-detail-tab";
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
        tableKey="schema-objects"
      />
    </div>
  );
}

const LOADING_SKELETON_KEYS = Array.from(
  { length: 8 },
  (_, index) => `schema-object-skeleton-${index + 1}`
);
const EMPTY_SCHEMA_SUMMARIES: SchemaSummary[] = [];

function noopSchemaTabChange(_tab: SchemaDetailTab): null {
  return null;
}

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

function isSchemaDetailLoading({
  tableCount,
  tablesError,
  tablesLoading,
  viewCount,
  viewsError,
  viewsLoading,
}: {
  tableCount: number;
  tablesError: unknown;
  tablesLoading: boolean;
  viewCount: number;
  viewsError: unknown;
  viewsLoading: boolean;
}): boolean {
  return (
    (tablesLoading || viewsLoading) &&
    tableCount === 0 &&
    viewCount === 0 &&
    !(tablesError || viewsError)
  );
}

function hasSchemaLoadError(
  tablesError: unknown,
  viewsError: unknown
): boolean {
  return Boolean(tablesError || viewsError);
}

function SchemaDetailNotices({
  hasObjectsError,
  tablesSyncNotice,
}: {
  hasObjectsError: boolean;
  tablesSyncNotice: ReturnType<typeof catalogSyncNotice> | undefined;
}) {
  if (!(tablesSyncNotice || hasObjectsError)) {
    return null;
  }
  return (
    <div className="flex shrink-0 flex-col gap-3 px-4 pt-3 sm:px-5">
      {tablesSyncNotice ? (
        <CatalogSyncNotice notice={tablesSyncNotice} surface="detail" />
      ) : null}
      {hasObjectsError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
          Failed to load some objects in this schema. Refresh the page to try
          again.
        </div>
      ) : null}
    </div>
  );
}

function SchemaDetail({
  activeTab = "objects",
  databaseId = "",
  hasMoreTables = false,
  hasMoreViews = false,
  instanceId = "",
  onSelectTable,
  onSelectTableInSchema,
  onSelectView,
  onTabChange = noopSchemaTabChange,
  owner,
  schemas = EMPTY_SCHEMA_SUMMARIES,
  schemaName,
  tables,
  tablesError,
  tablesLoading,
  tablesSyncNotice,
  views,
  viewsError,
  viewsLoading,
}: {
  activeTab?: SchemaDetailTab;
  databaseId?: string;
  hasMoreTables?: boolean;
  hasMoreViews?: boolean;
  instanceId?: string;
  onSelectTable: (name: string) => void;
  onSelectTableInSchema?: (schemaName: string, name: string) => void;
  onSelectView: (name: string) => void;
  onTabChange?: (tab: SchemaDetailTab) => void;
  owner: string;
  schemas?: SchemaSummary[];
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
  const isLoading = isSchemaDetailLoading({
    tableCount: tables.length,
    tablesError,
    tablesLoading,
    viewCount: views.length,
    viewsError,
    viewsLoading,
  });
  const mapSchemas = [
    schemas.find((schema) => schema.name === schemaName) ?? {
      id: schemaName,
      name: schemaName,
      owner,
    },
  ];
  const handleSelectTableInSchema =
    onSelectTableInSchema ??
    ((_schemaName: string, name: string) => onSelectTable(name));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ObjectDetailHeader
        icon={DatabaseIcon}
        iconClassName="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        stats={
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
        }
        subtitle={owner ? `schema · owner: ${owner}` : "schema"}
        title={schemaName}
        titleAriaLabel={schemaName}
      />

      <SchemaDetailNotices
        hasObjectsError={hasSchemaLoadError(tablesError, viewsError)}
        tablesSyncNotice={tablesSyncNotice}
      />

      <Tabs
        className="min-h-0 flex-1 flex-col gap-0"
        onValueChange={(next) => {
          if (next === "objects" || next === "map") {
            onTabChange(next);
          }
        }}
        value={activeTab}
      >
        <ObjectDetailTabsBar>
          <ObjectDetailTabTrigger
            count={isLoading ? undefined : tables.length + views.length}
            label="Objects"
            value="objects"
          />
          <ObjectDetailTabTrigger label="Schema map" value="map" />
        </ObjectDetailTabsBar>
        <TabsContent
          className={OBJECT_DETAIL_PANEL_PADDED_CLASS}
          value="objects"
        >
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
        </TabsContent>
        <TabsContent
          className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4"
          value="map"
        >
          {activeTab === "map" ? (
            <ExplorerSchemaMap
              activeSchemaName={schemaName}
              databaseId={databaseId}
              enabled={true}
              instanceId={instanceId}
              key={schemaName}
              onSelectTable={handleSelectTableInSchema}
              schemas={mapSchemas}
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export { SchemaDetail };
