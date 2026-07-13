"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { CircleOff, Eye, FolderTree, Table2, X } from "lucide-react";
import { useState } from "react";
import { AppInlineError } from "@/components/app-error-view";
import { CatalogKindBadge } from "@/components/console-pages/catalog-object-badge";
import {
  InstanceStatItem,
  InstanceStatsBar,
  ResourcePageState,
} from "@/components/console-pages/console-layout";
import {
  filterCatalogObjectsByFacets,
  filterCatalogSchemasByFacets,
  presentCatalogObjectKindOptions,
  presentCatalogObjectOwnerOptions,
  presentCatalogObjectSchemaOptions,
  presentCatalogObjectSystemOptions,
  presentCatalogSchemaKindOptions,
  presentCatalogSchemaOwnerOptions,
} from "@/components/console-pages/database-overview-filters";
import { DatabaseQueryInsightsDrawer } from "@/components/console-pages/database-query-insights-drawer";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRows } from "@/features/data-explorer/format-rows";
import { useGetDatabaseQuery } from "@/hooks/api/database";
import {
  type CatalogObject,
  type CatalogSchema,
  type DatabaseCatalogResult,
  useDatabaseCatalogQuery,
} from "@/hooks/api/database-catalog";
import {
  buildDatabaseName,
  formatBytes,
  formatTimestampLabel,
  normalizeEstimatedRowCount,
} from "@/lib/console-resources";
import { createResourceLoader } from "@/lib/resource-loader";
import { normalizeAppUiError } from "@/lib/ui-error";
import { cn } from "@/lib/utils";
import type { Database } from "@/protogen/querylane/console/v1alpha1/database_pb";
import { Table_TableType } from "@/protogen/querylane/console/v1alpha1/table_pb";

type DatabaseSection = "overview";

const OBJECTS_PAGE_SIZE = 15;
const SCHEMAS_PAGE_SIZE = 15;
const EXPLORER_ROUTE =
  "/instances/$instanceId/databases/$databaseId/explorer" as const;
const LOADING_ROW_COUNT = 5;
const LOADING_ROW_KEYS = Array.from(
  { length: LOADING_ROW_COUNT },
  (_, index) => `database-catalog-loading-row-${index + 1}`
);

interface CatalogLoadingColumn {
  headerClassName?: string;
  label: string;
}

interface DatabaseOverviewFacetFilter {
  handleSelectedValuesChange: (values: string[]) => void;
  label: string;
  options: FacetedFilterOption[];
  selectedValues: string[];
}

const OBJECT_LOADING_COLUMNS: CatalogLoadingColumn[] = [
  { label: "Object" },
  { label: "Kind" },
  { label: "Owner" },
  { headerClassName: "text-right", label: "Est. rows" },
  { headerClassName: "text-right", label: "Size" },
];

const SCHEMA_LOADING_COLUMNS: CatalogLoadingColumn[] = [
  { label: "Schema" },
  { label: "Owner" },
  { headerClassName: "text-right", label: "Tables" },
  { headerClassName: "text-right", label: "Views" },
  { headerClassName: "text-right", label: "Size" },
  { headerClassName: "text-right", label: "Est. rows" },
  { label: "Last DDL" },
];

function DatabaseOverviewHeader({
  database,
  databaseId,
  instanceId,
  onViewQueryInsights,
}: {
  database: Database;
  databaseId: string;
  instanceId: string;
  onViewQueryInsights: () => void;
}) {
  const kindLabel = database.isSystemDatabase
    ? "System database"
    : "User database";
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="min-w-0 break-words font-semibold text-2xl text-foreground tracking-tight [overflow-wrap:anywhere]">
          {database.displayName}
        </h1>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
          <span className="text-foreground">{database.owner || "—"}</span>
          <span className="text-border">|</span>
          <span>{database.characterSet || "—"}</span>
          <span className="text-border">|</span>
          <span>{database.collation || "—"}</span>
          <span className="text-border">|</span>
          <span>{kindLabel}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onViewQueryInsights} type="button" variant="outline">
          View query insights
        </Button>
        <Link
          className={cn(buttonVariants({ variant: "outline" }))}
          params={{ databaseId, instanceId }}
          to={EXPLORER_ROUTE}
        >
          Open data explorer
        </Link>
      </div>
    </div>
  );
}

function DatabaseStatItemValue({
  isPending,
  value,
}: {
  isPending: boolean;
  value: string | number;
}) {
  return (
    <span className="font-bold font-mono text-xl tabular-nums tracking-tight">
      {isPending ? "—" : value}
    </span>
  );
}

function DatabaseStatsBar({
  catalog,
  isPending,
}: {
  catalog: DatabaseCatalogResult | undefined;
  isPending: boolean;
}) {
  const totals = catalog?.totals;
  return (
    <InstanceStatsBar>
      <InstanceStatItem label="Tables">
        <DatabaseStatItemValue
          isPending={isPending}
          value={totals?.tableCount ?? "—"}
        />
      </InstanceStatItem>
      <InstanceStatItem label="Views">
        <DatabaseStatItemValue
          isPending={isPending}
          value={totals?.viewCount ?? "—"}
        />
      </InstanceStatItem>
      <InstanceStatItem label="Total size">
        <DatabaseStatItemValue
          isPending={isPending}
          value={totals ? formatBytes(totals.totalSizeBytes) : "—"}
        />
      </InstanceStatItem>
      <InstanceStatItem label="Est. rows">
        <DatabaseStatItemValue
          isPending={isPending}
          value={totals ? formatRows(totals.estimatedRows) : "—"}
        />
      </InstanceStatItem>
    </InstanceStatsBar>
  );
}

function catalogObjectIcon(object: CatalogObject) {
  if (object.kind === "view") {
    return Eye;
  }
  if (object.tableType === Table_TableType.PARTITIONED) {
    return FolderTree;
  }
  return Table2;
}

function objectColumns(): DataTableColumnDef<CatalogObject>[] {
  return [
    {
      // Match the displayed "schema.object" so the filter box narrows on the
      // schema prefix the user sees, not just the bare object name.
      accessorFn: (row) => `${row.schemaId}.${row.objectId}`,
      cell: ({ row }) => {
        const Icon = catalogObjectIcon(row.original);
        return (
          <span className="flex min-w-0 items-center gap-2">
            <Icon
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 truncate font-mono text-sm">
              <span className="text-muted-foreground">
                {row.original.schemaId}.
              </span>
              {row.original.objectId}
            </span>
          </span>
        );
      },
      header: ({ column }) => (
        <SortableHeader column={column}>Object</SortableHeader>
      ),
      id: "object",
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
    },
    {
      accessorFn: (row) => row.owner,
      cell: ({ row }) => row.original.owner || "—",
      header: ({ column }) => (
        <SortableHeader column={column}>Owner</SortableHeader>
      ),
      id: "owner",
      meta: {
        cellClassName: "text-sm text-muted-foreground",
      },
    },
    {
      accessorFn: (row) => normalizeEstimatedRowCount(row.rowCount),
      cell: ({ row }) =>
        formatRows(normalizeEstimatedRowCount(row.original.rowCount)),
      header: ({ column }) => (
        <SortableHeader column={column}>Est. rows</SortableHeader>
      ),
      id: "estRows",
      meta: {
        cellClassName: "text-right tabular-nums",
        headerClassName: "text-right",
      },
    },
    {
      accessorFn: (row) => Number(row.sizeBytes),
      cell: ({ row }) => formatBytes(row.original.sizeBytes),
      header: ({ column }) => (
        <SortableHeader column={column}>Size</SortableHeader>
      ),
      id: "size",
      meta: {
        cellClassName: "text-right tabular-nums",
        headerClassName: "text-right",
      },
    },
  ];
}

function schemaColumns(): DataTableColumnDef<CatalogSchema>[] {
  return [
    {
      accessorFn: (row) => row.schemaId,
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <FolderTree
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <span className="font-medium text-sm">{row.original.schemaId}</span>
          {row.original.isSystemSchema ? (
            <Badge variant="outline">System</Badge>
          ) : (
            <Badge variant="secondary">User</Badge>
          )}
        </span>
      ),
      header: ({ column }) => (
        <SortableHeader column={column}>Schema</SortableHeader>
      ),
      id: "schema",
    },
    {
      accessorFn: (row) => row.owner,
      cell: ({ row }) => row.original.owner || "—",
      header: ({ column }) => (
        <SortableHeader column={column}>Owner</SortableHeader>
      ),
      id: "owner",
      meta: {
        cellClassName: "text-sm text-muted-foreground",
      },
    },
    {
      accessorFn: (row) => row.tableCount,
      header: ({ column }) => (
        <SortableHeader column={column}>Tables</SortableHeader>
      ),
      id: "tables",
      meta: {
        cellClassName: "text-right tabular-nums",
        headerClassName: "text-right",
      },
    },
    {
      accessorFn: (row) => row.viewCount,
      header: ({ column }) => (
        <SortableHeader column={column}>Views</SortableHeader>
      ),
      id: "views",
      meta: {
        cellClassName: "text-right tabular-nums",
        headerClassName: "text-right",
      },
    },
    {
      accessorFn: (row) => Number(row.totalSizeBytes),
      cell: ({ row }) => formatBytes(row.original.totalSizeBytes),
      header: ({ column }) => (
        <SortableHeader column={column}>Size</SortableHeader>
      ),
      id: "size",
      meta: {
        cellClassName: "text-right tabular-nums",
        headerClassName: "text-right",
      },
    },
    {
      accessorFn: (row) => row.estimatedRows,
      cell: ({ row }) => formatRows(row.original.estimatedRows),
      header: ({ column }) => (
        <SortableHeader column={column}>Est. rows</SortableHeader>
      ),
      id: "estRows",
      meta: {
        cellClassName: "text-right tabular-nums",
        headerClassName: "text-right",
      },
    },
    {
      accessorFn: (row) => row.lastDdlTime,
      cell: ({ row }) => formatTimestampLabel(row.original.lastDdlTime),
      enableSorting: false,
      header: () => "Last DDL",
      id: "lastDdl",
      meta: {
        cellClassName: "text-sm text-muted-foreground",
      },
    },
  ];
}

function CatalogErrorNotice({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => Promise<unknown>;
}) {
  return (
    <AppInlineError
      error={normalizeAppUiError(error, {
        action: "load_database_catalog",
        area: "console.database.catalog",
        endpoint: "DatabaseCatalog",
        source: "query",
        surface: "inline",
      })}
      onRetry={onRetry}
    />
  );
}

function CatalogLoadingTable({
  columns,
  resourceName,
}: {
  columns: CatalogLoadingColumn[];
  resourceName: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table aria-busy={true}>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                className={cn(
                  "text-muted-foreground text-xs",
                  column.headerClassName
                )}
                key={column.label}
              >
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="border-border hover:bg-transparent">
            <TableCell className="p-0" colSpan={columns.length}>
              <div className="flex min-h-24 flex-col gap-2 p-3">
                <output
                  aria-label={`Loading ${resourceName}`}
                  className="sr-only"
                >
                  Loading {resourceName}
                </output>
                {LOADING_ROW_KEYS.map((key) => (
                  <Skeleton
                    aria-hidden="true"
                    className="h-7 w-full"
                    key={key}
                  />
                ))}
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

function DatabaseOverviewFilterBar({
  dataSlot,
  filters,
  onSearchChange,
  search,
  searchPlaceholder,
}: {
  dataSlot: string;
  filters: DatabaseOverviewFacetFilter[];
  onSearchChange: (value: string) => void;
  search: string;
  searchPlaceholder: string;
}) {
  const visibleFilters = filters.filter((filter) => filter.options.length > 0);
  const hasActiveFacet = visibleFilters.some(
    (filter) => filter.selectedValues.length > 0
  );

  return (
    <div
      className="flex min-w-0 flex-wrap items-center justify-start gap-2"
      data-slot={dataSlot}
    >
      <DataTableFilter
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        value={search}
      />
      {visibleFilters.map((filter) => (
        <DataTableFacetedFilter
          key={filter.label}
          onSelectedValuesChange={filter.handleSelectedValuesChange}
          options={filter.options}
          selectedValues={filter.selectedValues}
          title={filter.label}
        />
      ))}
      {hasActiveFacet ? (
        <Button
          className="h-8 px-2 text-xs"
          onClick={() => {
            for (const filter of visibleFilters) {
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

function LargestObjectsSection({
  catalog,
  databaseId,
  instanceId,
  isPending,
}: {
  catalog: DatabaseCatalogResult | undefined;
  databaseId: string;
  instanceId: string;
  isPending: boolean;
}) {
  const [filter, setFilter] = useState("");
  const [kindFilters, setKindFilters] = useState<string[]>([]);
  const [ownerFilters, setOwnerFilters] = useState<string[]>([]);
  const [schemaFilters, setSchemaFilters] = useState<string[]>([]);
  const [systemFilters, setSystemFilters] = useState<string[]>([]);
  const navigate = useNavigate();
  const objects = catalog?.objects ?? [];
  const filteredObjects = filterCatalogObjectsByFacets({
    kindFilters,
    objects,
    ownerFilters,
    schemaFilters,
    systemFilters,
  });
  const objectFacetFilters = [
    {
      handleSelectedValuesChange: setKindFilters,
      label: "Kind",
      options: presentCatalogObjectKindOptions(objects),
      selectedValues: kindFilters,
    },
    {
      handleSelectedValuesChange: setSystemFilters,
      label: "System",
      options: presentCatalogObjectSystemOptions(objects),
      selectedValues: systemFilters,
    },
    {
      handleSelectedValuesChange: setOwnerFilters,
      label: "Owner",
      options: presentCatalogObjectOwnerOptions(objects),
      selectedValues: ownerFilters,
    },
    {
      handleSelectedValuesChange: setSchemaFilters,
      label: "Schema",
      options: presentCatalogObjectSchemaOptions(objects),
      selectedValues: schemaFilters,
    },
  ] satisfies DatabaseOverviewFacetFilter[];
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold text-base text-foreground">
          Largest objects
        </h2>
        {isPending ? null : (
          <span className="text-muted-foreground text-xs tabular-nums">
            {filteredObjects.length}
          </span>
        )}
      </div>
      {isPending ? null : (
        <DatabaseOverviewFilterBar
          dataSlot="largest-object-filter-bar"
          filters={objectFacetFilters}
          onSearchChange={setFilter}
          search={filter}
          searchPlaceholder="Search objects..."
        />
      )}
      {isPending ? (
        <CatalogLoadingTable
          columns={OBJECT_LOADING_COLUMNS}
          resourceName="objects"
        />
      ) : (
        <DataTable
          columns={objectColumns()}
          data={filteredObjects}
          emptyResourceName="objects"
          filterColumn="object"
          filterValue={filter}
          initialSorting={[{ desc: true, id: "size" }]}
          onFilterChange={setFilter}
          onRowClick={(row) => {
            navigate({
              params: { databaseId, instanceId },
              search: {
                category: row.kind === "table" ? "tables" : "views",
                name: row.objectId,
                schema: row.schemaId,
              },
              to: EXPLORER_ROUTE,
            });
          }}
          pageSize={OBJECTS_PAGE_SIZE}
          tableKey="database-objects"
        />
      )}
    </section>
  );
}

function SchemasSection({
  catalog,
  databaseId,
  instanceId,
  isPending,
}: {
  catalog: DatabaseCatalogResult | undefined;
  databaseId: string;
  instanceId: string;
  isPending: boolean;
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");
  const [kindFilters, setKindFilters] = useState<string[]>([]);
  const [ownerFilters, setOwnerFilters] = useState<string[]>([]);
  const schemas = catalog?.schemas ?? [];
  const filteredSchemas = filterCatalogSchemasByFacets({
    kindFilters,
    ownerFilters,
    schemas,
  });
  const schemaFacetFilters = [
    {
      handleSelectedValuesChange: setKindFilters,
      label: "System",
      options: presentCatalogSchemaKindOptions(schemas),
      selectedValues: kindFilters,
    },
    {
      handleSelectedValuesChange: setOwnerFilters,
      label: "Owner",
      options: presentCatalogSchemaOwnerOptions(schemas),
      selectedValues: ownerFilters,
    },
  ] satisfies DatabaseOverviewFacetFilter[];
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold text-base text-foreground">Schemas</h2>
        {isPending ? null : (
          <span className="text-muted-foreground text-xs tabular-nums">
            {filteredSchemas.length}
          </span>
        )}
      </div>
      {isPending ? null : (
        <DatabaseOverviewFilterBar
          dataSlot="schema-filter-bar"
          filters={schemaFacetFilters}
          onSearchChange={setFilter}
          search={filter}
          searchPlaceholder="Search schemas..."
        />
      )}
      {isPending ? (
        <CatalogLoadingTable
          columns={SCHEMA_LOADING_COLUMNS}
          resourceName="schemas"
        />
      ) : (
        <DataTable
          columns={schemaColumns()}
          data={filteredSchemas}
          emptyResourceName="schemas"
          filterColumn="schema"
          filterValue={filter}
          initialSorting={[{ desc: true, id: "size" }]}
          onFilterChange={setFilter}
          onRowClick={(row) => {
            navigate({
              params: { databaseId, instanceId },
              search: { schema: row.schemaId },
              to: EXPLORER_ROUTE,
            });
          }}
          pageSize={SCHEMAS_PAGE_SIZE}
          tableKey="database-schemas"
        />
      )}
    </section>
  );
}

function BackendDatabasePage({
  databaseId,
  instanceId,
}: {
  databaseId: string;
  instanceId: string;
  section: DatabaseSection;
}) {
  const databaseName = buildDatabaseName(instanceId, databaseId);
  const [queryInsightsDatabaseName, setQueryInsightsDatabaseName] = useState<
    string | null
  >(null);
  const queryInsightsOpen = queryInsightsDatabaseName === databaseName;
  const databaseQuery = useGetDatabaseQuery(
    {
      name: buildDatabaseName(instanceId, databaseId),
    },
    {
      enabled: Boolean(instanceId && databaseId),
      refetchOnWindowFocus: false,
    }
  );
  const catalogQuery = useDatabaseCatalogQuery({ databaseId, instanceId });
  const loader = createResourceLoader(databaseQuery, "console.database");
  const database = databaseQuery.data?.database;
  const catalog = catalogQuery.data;
  const catalogPending = catalogQuery.isPending;
  const handleCatalogRetry = catalogQuery.refetch;

  return (
    <ResourcePageState
      {...loader.pageStateProps}
      notFoundState={<DatabaseNotFoundState />}
      title="Loading database"
    >
      {database ? (
        <div className="flex flex-col gap-8">
          <DatabaseOverviewHeader
            database={database}
            databaseId={databaseId}
            instanceId={instanceId}
            onViewQueryInsights={() =>
              setQueryInsightsDatabaseName(databaseName)
            }
          />
          <DatabaseStatsBar catalog={catalog} isPending={catalogPending} />
          {catalogQuery.error ? (
            <CatalogErrorNotice
              error={catalogQuery.error}
              onRetry={handleCatalogRetry}
            />
          ) : null}
          <LargestObjectsSection
            catalog={catalog}
            databaseId={databaseId}
            instanceId={instanceId}
            isPending={catalogPending}
          />
          <SchemasSection
            catalog={catalog}
            databaseId={databaseId}
            instanceId={instanceId}
            isPending={catalogPending}
          />
          {queryInsightsOpen ? (
            <DatabaseQueryInsightsDrawer
              databaseId={databaseId}
              instanceId={instanceId}
              onOpenChange={(open) => {
                if (!open) {
                  setQueryInsightsDatabaseName(null);
                }
              }}
              open={queryInsightsOpen}
            />
          ) : null}
        </div>
      ) : null}
    </ResourcePageState>
  );
}

function DatabaseNotFoundState() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <EmptyState
          description="This database is no longer available from the backend. Select another database from the header or return to the instance overview."
          icon={CircleOff}
          title="Database not found"
        />
      </div>
    </div>
  );
}

export { BackendDatabasePage };
