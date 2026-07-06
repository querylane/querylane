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
import { EmptyState } from "@/components/empty-state";
import { Progress } from "@/components/querylane-ui/progress";
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
import { SqlCodeBlock } from "@/components/ui/sql-code-block";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRows } from "@/features/data-explorer/format-rows";
import {
  useGetDatabaseQuery,
  useGetDatabaseQueryInsightsQuery,
} from "@/hooks/api/database";
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
import type {
  Database,
  DatabaseQueryInsights,
  QueryRuntimeInsight,
  SequentialScanHotspot,
  TableCacheHitInsight,
} from "@/protogen/querylane/console/v1alpha1/database_pb";
import { Table_TableType } from "@/protogen/querylane/console/v1alpha1/table_pb";

type DatabaseSection = "overview";

const OBJECTS_PAGE_SIZE = 15;
const SCHEMAS_PAGE_SIZE = 15;
const MILLISECONDS_PER_SECOND = 1000;
const PERCENT_RATIO_MULTIPLIER = 100;
const CACHE_HIT_WARNING_THRESHOLD = 0.9;
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
}: {
  database: Database;
  databaseId: string;
  instanceId: string;
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
      <Link
        className={cn(buttonVariants({ variant: "outline" }))}
        params={{ databaseId, instanceId }}
        to={EXPLORER_ROUTE}
      >
        Open data explorer
      </Link>
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

function formatInsightInteger(value: bigint | number) {
  return value.toLocaleString();
}

function formatInsightMs(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return "—";
  }

  if (value >= MILLISECONDS_PER_SECOND) {
    return `${(value / MILLISECONDS_PER_SECOND).toFixed(1)} s`;
  }

  if (value >= 10) {
    return `${Math.round(value).toLocaleString()} ms`;
  }

  return `${value.toFixed(1)} ms`;
}

function formatInsightPercent(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return "—";
  }

  return `${Math.round(value * PERCENT_RATIO_MULTIPLIER).toLocaleString()}%`;
}

function formatQualifiedTable(schemaName: string, tableName: string) {
  return `${schemaName}.${tableName}`;
}

function insightProgressValue(ratio: number) {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 0;
  }

  return Math.min(ratio * PERCENT_RATIO_MULTIPLIER, PERCENT_RATIO_MULTIPLIER);
}

function queryInsightLabel(query: QueryRuntimeInsight) {
  const queryText = query.query.trim();
  if (queryText) {
    return queryText;
  }

  if (query.queryId !== 0n) {
    return `Query ID ${query.queryId.toString()}`;
  }

  return "Query text unavailable";
}

function QueryInsightPanel({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-4">
      <h3 className="font-medium text-foreground text-sm">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function TopQueryItem({ query }: { query: QueryRuntimeInsight }) {
  const queryLabel = queryInsightLabel(query);
  return (
    <li className="grid gap-3 rounded-md border border-border/70 bg-background p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
        <span>{formatInsightInteger(query.calls)} calls</span>
        <span>{formatInsightMs(query.meanTimeMs)} mean</span>
        <span>{formatInsightMs(query.totalTimeMs)} total</span>
      </div>
      <Progress
        aria-label={`Total time ratio for ${queryLabel}`}
        className="gap-0"
        value={insightProgressValue(query.totalTimeRatio)}
      />
      <SqlCodeBlock className="max-h-28" sql={queryLabel} />
    </li>
  );
}

function TopQueriesPanel({ queries }: { queries: QueryRuntimeInsight[] }) {
  return (
    <QueryInsightPanel title="Top queries by total time">
      {queries.length > 0 ? (
        <ol className="grid gap-3">
          {queries.map((query) => (
            <TopQueryItem key={`${query.query}:${query.calls}`} query={query} />
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground text-sm">
          No query runtime data yet.
        </p>
      )}
    </QueryInsightPanel>
  );
}

function SequentialScanHotspotItem({
  hotspot,
}: {
  hotspot: SequentialScanHotspot;
}) {
  return (
    <li className="grid gap-2 rounded-md border border-border/70 bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-sm">
          {formatQualifiedTable(hotspot.schemaName, hotspot.tableName)}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {formatInsightPercent(hotspot.sequentialScanRatio)} sequential
        </span>
      </div>
      <Progress
        aria-label={`Sequential scan ratio for ${formatQualifiedTable(hotspot.schemaName, hotspot.tableName)}`}
        className="gap-0"
        value={insightProgressValue(hotspot.sequentialScanRatio)}
      />
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
        <span>
          {formatInsightInteger(hotspot.sequentialTuplesRead)} tuples read
        </span>
        <span>
          {formatInsightInteger(hotspot.sequentialScans)} sequential scans
        </span>
        <span>{formatInsightInteger(hotspot.indexScans)} index scans</span>
        <span>{formatBytes(hotspot.totalSizeBytes)}</span>
      </div>
    </li>
  );
}

function SequentialScanHotspotsPanel({
  hotspots,
}: {
  hotspots: SequentialScanHotspot[];
}) {
  return (
    <QueryInsightPanel title="Sequential scan hotspots">
      {hotspots.length > 0 ? (
        <ol className="grid gap-3">
          {hotspots.map((hotspot) => (
            <SequentialScanHotspotItem
              hotspot={hotspot}
              key={`${hotspot.schemaName}.${hotspot.tableName}`}
            />
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground text-sm">
          No sequential scan pressure reported yet.
        </p>
      )}
    </QueryInsightPanel>
  );
}

function TableCacheHitItem({ cacheHit }: { cacheHit: TableCacheHitInsight }) {
  const warning = cacheHit.hitRatio < CACHE_HIT_WARNING_THRESHOLD;
  return (
    <li className="grid gap-2 rounded-md border border-border/70 bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-sm">
          {formatQualifiedTable(cacheHit.schemaName, cacheHit.tableName)}
        </span>
        <div className="flex items-center gap-2">
          {warning ? (
            <Badge
              className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              variant="outline"
            >
              Low cache hit
            </Badge>
          ) : null}
          <span
            className={cn(
              "text-xs tabular-nums",
              warning
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground"
            )}
          >
            {formatInsightPercent(cacheHit.hitRatio)} hit
          </span>
        </div>
      </div>
      <Progress
        aria-label={`${warning ? "Low cache hit, " : ""}cache hit ratio for ${formatQualifiedTable(cacheHit.schemaName, cacheHit.tableName)}`}
        className="gap-0"
        value={insightProgressValue(cacheHit.hitRatio)}
        variant={warning ? "warning" : "default"}
      />
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
        <span>{formatInsightInteger(cacheHit.heapBlocksHit)} heap hits</span>
        <span>{formatInsightInteger(cacheHit.heapBlocksRead)} heap reads</span>
        <span>{formatBytes(cacheHit.totalSizeBytes)}</span>
      </div>
    </li>
  );
}

function TableCacheHitsPanel({
  cacheHits,
}: {
  cacheHits: TableCacheHitInsight[];
}) {
  return (
    <QueryInsightPanel title="Cache hit by table">
      {cacheHits.length > 0 ? (
        <ol className="grid gap-3">
          {cacheHits.map((cacheHit) => (
            <TableCacheHitItem
              cacheHit={cacheHit}
              key={`${cacheHit.schemaName}.${cacheHit.tableName}`}
            />
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground text-sm">
          No table cache data yet.
        </p>
      )}
    </QueryInsightPanel>
  );
}

function QueryInsightsSection({
  error,
  insights,
  isPending,
}: {
  error: unknown;
  insights?: DatabaseQueryInsights | undefined;
  isPending: boolean;
}) {
  if (error) {
    return null;
  }

  if (isPending) {
    return (
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-base text-foreground">
            Query insights
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Loading PostgreSQL query statistics.
          </p>
        </div>
      </section>
    );
  }

  if (!(insights?.queryStatsAvailable || insights?.tableStatsAvailable)) {
    return null;
  }

  return (
    <section
      className="flex flex-col gap-3"
      data-testid="database-query-insights"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-base text-foreground">
          Query insights
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Live PostgreSQL statistics since the last stats reset.
        </p>
      </div>
      <div className="grid gap-3 2xl:grid-cols-3">
        {insights.queryStatsAvailable ? (
          <TopQueriesPanel queries={insights.topQueries} />
        ) : null}
        {insights.tableStatsAvailable ? (
          <>
            <SequentialScanHotspotsPanel
              hotspots={insights.sequentialScanHotspots}
            />
            <TableCacheHitsPanel cacheHits={insights.tableCacheHits} />
          </>
        ) : null}
      </div>
    </section>
  );
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
  const queryInsightsQuery = useGetDatabaseQueryInsightsQuery(
    {
      name: buildDatabaseName(instanceId, databaseId),
    },
    {
      enabled: Boolean(databaseId && instanceId && database),
      refetchOnWindowFocus: false,
    }
  );
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
          />
          <DatabaseStatsBar catalog={catalog} isPending={catalogPending} />
          <QueryInsightsSection
            error={queryInsightsQuery.error}
            insights={queryInsightsQuery.data?.queryInsights}
            isPending={queryInsightsQuery.isPending}
          />
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
