import {
  Binary,
  Boxes,
  GitBranch,
  Hash,
  ListTree,
  type LucideIcon,
  Network,
  RadioTower,
  Rows3,
  Search,
  Sparkles,
  Table2,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import {
  type DataTableColumnDef,
  SortableHeader,
} from "@/components/ui/data-table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { deriveMetadataToolbar } from "@/features/data-explorer/explorer-table-detail/metadata";
import { presentIndexMethodOptions } from "@/features/data-explorer/explorer-table-detail/options";
import {
  FacetFilterBar,
  MetadataTabResult,
  Pill,
  TabError,
  TabSkeleton,
} from "@/features/data-explorer/explorer-table-detail/shared-ui";
import { filterIndexesByMethod } from "@/features/data-explorer/explorer-table-detail-filters";
import {
  describePostgresIndexMethod,
  normalizeIndexMethod,
} from "@/features/data-explorer/postgres-index-method-display";
import type { useListTableIndexesQuery } from "@/hooks/api/table";
import { formatBytes } from "@/lib/console-resources";
import type {
  TableIndex,
  Table as TableProto,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

const INDEX_METHOD_ICONS: Record<string, LucideIcon> = {
  bloom: Sparkles,
  brin: Rows3,
  btree: GitBranch,
  gin: ListTree,
  gist: Boxes,
  hash: Hash,
  hnsw: RadioTower,
  ivfflat: Binary,
  rum: Search,
  spgist: Network,
};

const SIMPLE_SQL_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;
const COMPACT_ONE_DECIMAL_THRESHOLD = 100;
const ONE_DECIMAL_SCALE = 10;
const CACHE_PERCENT_TENTHS_SCALE = 1000n;
const CACHE_HIT_DESCRIPTION =
  "PostgreSQL shared-buffer hit ratio; operating-system cache reads count as reads.";

function formatIndexSqlIdentifier(identifier: string) {
  if (SIMPLE_SQL_IDENTIFIER_PATTERN.test(identifier)) {
    return identifier;
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}
function formatIndexQualifiedTableName(schemaName: string, tableName: string) {
  return `${formatIndexSqlIdentifier(schemaName)}.${formatIndexSqlIdentifier(tableName)}`;
}
function formatIndexSqlColumns(index: TableIndex) {
  const keyParts = getIndexKeyParts(index);
  if (keyParts.length === 0) {
    return "/* expression */";
  }
  return keyParts.map(formatIndexKeyPartForSql).join(", ");
}
function createIndexSql({
  index,
  schemaName,
  tableName,
}: {
  index: TableIndex;
  schemaName: string;
  tableName: string;
}) {
  if (index.definition) {
    return index.definition;
  }
  const unique = index.isUnique ? "UNIQUE " : "";
  const indexName = formatIndexSqlIdentifier(
    index.indexName || "unnamed_index"
  );
  const method = index.method || "btree";
  const columns = formatIndexSqlColumns(index);
  const included =
    index.includedColumns.length > 0
      ? ` INCLUDE (${index.includedColumns.map(formatIndexSqlIdentifier).join(", ")})`
      : "";
  const predicate = index.predicate ? ` WHERE ${index.predicate}` : "";
  return `CREATE ${unique}INDEX ${indexName} ON ${formatIndexQualifiedTableName(
    schemaName,
    tableName
  )} USING ${method} (${columns})${included}${predicate}`;
}
function formatIndexKeyPartForSql(keyPart: string) {
  if (SIMPLE_SQL_IDENTIFIER_PATTERN.test(keyPart)) {
    return keyPart;
  }
  if (
    keyPart.startsWith('"') ||
    keyPart.includes("(") ||
    keyPart.includes(" ")
  ) {
    return keyPart;
  }
  return formatIndexSqlIdentifier(keyPart);
}
function getIndexKeyParts(index: TableIndex) {
  if (index.keyParts.length > 0) {
    return index.keyParts;
  }
  return index.keyColumns;
}
function sumIndexSizeBytes(indexes: TableIndex[]) {
  return indexes.reduce<bigint>((total, index) => {
    if (index.sizeBytes < 0n) {
      return total;
    }
    return total + index.sizeBytes;
  }, 0n);
}
function sumIndexScans(indexes: TableIndex[]) {
  return indexes.reduce<bigint>((total, index) => {
    if (!(index.hasUsageStats && index.scanCount > 0n)) {
      return total;
    }
    return total + index.scanCount;
  }, 0n);
}
function hasIndexUsageStats(indexes: TableIndex[]) {
  return indexes.some((index) => index.hasUsageStats);
}
function isIndexUnused(index: TableIndex) {
  return index.hasUsageStats && index.scanCount === 0n;
}
function indexInvalidCount(indexes: TableIndex[]) {
  return indexes.filter((index) => !index.isValid).length;
}
function formatCompactInteger(value: bigint) {
  if (value === 0n) {
    return "0";
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value.toLocaleString();
  }
  const units = [
    { suffix: "B", value: 1_000_000_000 },
    { suffix: "M", value: 1_000_000 },
    { suffix: "k", value: 1000 },
  ] as const;
  const unit = units.find((candidate) => numeric >= candidate.value);
  if (!unit) {
    return numeric.toLocaleString();
  }
  const compact = numeric / unit.value;
  const rounded =
    compact >= COMPACT_ONE_DECIMAL_THRESHOLD
      ? Math.round(compact)
      : Math.round(compact * ONE_DECIMAL_SCALE) / ONE_DECIMAL_SCALE;
  return `${rounded.toLocaleString()}${unit.suffix}`;
}
function formatMaybeStat(value: bigint, hasUsageStats: boolean) {
  if (!hasUsageStats) {
    return "—";
  }
  return formatCompactInteger(value);
}
function formatCacheHit(index: TableIndex) {
  if (!index.hasUsageStats) {
    return "—";
  }
  const totalBlocks = index.blocksHit + index.blocksRead;
  if (totalBlocks <= 0n) {
    return "—";
  }
  const tenths =
    (index.blocksHit * CACHE_PERCENT_TENTHS_SCALE + totalBlocks / 2n) /
    totalBlocks;
  return `${(Number(tenths) / ONE_DECIMAL_SCALE).toLocaleString()}%`;
}
function IndexSummaryStrip({
  heapSizeBytes,
  indexes,
}: {
  heapSizeBytes: bigint | undefined;
  indexes: TableIndex[];
}) {
  const segments = [
    `${indexes.length.toLocaleString()} ${indexes.length === 1 ? "index" : "indexes"}`,
    `${formatBytes(sumIndexSizeBytes(indexes))} total vs heap ${formatBytes(heapSizeBytes)}`,
  ];
  if (hasIndexUsageStats(indexes)) {
    segments.push(
      `${formatCompactInteger(sumIndexScans(indexes))} scans since stats reset`
    );
    const unusedCount = indexes.filter(isIndexUnused).length;
    if (unusedCount > 0) {
      segments.push(`${unusedCount.toLocaleString()} unused`);
    }
  } else {
    segments.push("usage stats unavailable");
  }
  const invalidCount = indexInvalidCount(indexes);
  return (
    <p
      className="font-mono text-muted-foreground text-xs"
      data-slot="index-summary-strip"
    >
      {segments.join(" · ")}
      {invalidCount > 0 ? (
        <span className="text-destructive">
          {` · ${invalidCount.toLocaleString()} INVALID`}
        </span>
      ) : null}
    </p>
  );
}
function IndexNameCell({ index }: { index: TableIndex }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="truncate font-mono font-semibold text-foreground text-xs">
        {index.indexName || "unnamed_index"}
      </span>
      {index.isUnique ? (
        <Pill size="sm" tone="emerald">
          Unique
        </Pill>
      ) : null}
      {isIndexUnused(index) ? (
        <Pill
          size="sm"
          title="No scans since the last statistics reset"
          tone="amber"
        >
          Unused
        </Pill>
      ) : null}
      {index.isValid ? null : (
        <Pill
          size="sm"
          title="Index is marked INVALID in pg_index"
          tone="amber"
        >
          Invalid
        </Pill>
      )}
    </div>
  );
}
function formatIndexColumnsLabel(index: TableIndex) {
  const keyParts = getIndexKeyParts(index);
  return keyParts.length > 0 ? `(${keyParts.join(", ")})` : "—";
}
function IndexColumnsCell({ index }: { index: TableIndex }) {
  const columnsLabel = formatIndexColumnsLabel(index);
  const includeLabel =
    index.includedColumns.length > 0
      ? ` INCLUDE (${index.includedColumns.join(", ")})`
      : "";
  const whereLabel = index.predicate ? ` WHERE ${index.predicate}` : "";
  return (
    <span
      className="block max-w-[28rem] truncate"
      title={`${columnsLabel}${includeLabel}${whereLabel}`}
    >
      {columnsLabel}
      {includeLabel || whereLabel ? (
        <span className="text-muted-foreground">
          {includeLabel}
          {whereLabel}
        </span>
      ) : null}
    </span>
  );
}
function CacheHitHeader() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={`Cache hit. ${CACHE_HIT_DESCRIPTION}`}
            className="h-auto cursor-help rounded-none p-0 font-medium text-inherit underline decoration-dotted underline-offset-2"
            size="sm"
            type="button"
            variant="link"
          />
        }
      >
        Cache hit
      </TooltipTrigger>
      <TooltipContent>{CACHE_HIT_DESCRIPTION}</TooltipContent>
    </Tooltip>
  );
}
function buildIndexInventoryColumns({
  schemaName,
  tableName,
}: {
  schemaName: string;
  tableName: string;
}): DataTableColumnDef<TableIndex>[] {
  return [
    {
      accessorFn: (row) => row.indexName,
      cell: ({ row }) => <IndexNameCell index={row.original} />,
      header: ({ column }) => (
        <SortableHeader column={column}>Name</SortableHeader>
      ),
      id: "name",
    },
    {
      accessorFn: (row) => normalizeIndexMethod(row.method),
      cell: ({ row }) => <IndexMethodBadge method={row.original.method} />,
      header: ({ column }) => (
        <SortableHeader column={column}>Method</SortableHeader>
      ),
      id: "method",
    },
    {
      accessorFn: (row) => formatIndexColumnsLabel(row),
      cell: ({ row }) => <IndexColumnsCell index={row.original} />,
      header: "Columns",
      id: "columns",
      meta: {
        cellClassName: "font-mono text-xs",
      },
    },
    {
      accessorFn: (row) => (row.hasUsageStats ? Number(row.scanCount) : -1),
      cell: ({ row }) =>
        formatMaybeStat(row.original.scanCount, row.original.hasUsageStats),
      header: ({ column }) => (
        <SortableHeader column={column}>Scans</SortableHeader>
      ),
      id: "scans",
      meta: {
        cellClassName: "text-right font-mono text-xs tabular-nums",
        headerClassName: "text-right",
      },
    },
    {
      cell: ({ row }) => formatCacheHit(row.original),
      enableSorting: false,
      header: () => <CacheHitHeader />,
      id: "cacheHit",
      meta: {
        cellClassName: "text-right font-mono text-muted-foreground text-xs",
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
        cellClassName: "text-right font-mono text-xs tabular-nums",
        headerClassName: "text-right",
      },
    },
    {
      cell: ({ row }) => (
        <CopyIconButton
          ariaLabel="Copy CREATE INDEX SQL"
          value={createIndexSql({ index: row.original, schemaName, tableName })}
        />
      ),
      enableSorting: false,
      header: () => <span className="sr-only">Actions</span>,
      id: "actions",
      meta: {
        cellClassName: "w-10 text-right",
      },
    },
  ];
}
function IndexMethodBadge({ method }: { method: string }) {
  const methodMeta = describePostgresIndexMethod(method);
  const Icon = INDEX_METHOD_ICONS[normalizeIndexMethod(method)] ?? Table2;
  return (
    <Badge
      className="gap-1 rounded-full px-2 py-1 font-mono text-[11px]"
      title={`${methodMeta.label}. ${methodMeta.summary}`}
      variant="outline"
    >
      <Icon aria-hidden="true" className="size-3" />
      {normalizeIndexMethod(method)}
    </Badge>
  );
}
function IndexesTab({
  query,
  schemaName,
  table,
  tableName,
}: {
  query: ReturnType<typeof useListTableIndexesQuery>;
  schemaName: string;
  table: TableProto | undefined;
  tableName: string;
}) {
  const [methodFilters, setMethodFilters] = useState<string[]>([]);
  const toolbar = deriveMetadataToolbar([query]);
  if (query.error) {
    return (
      <TabError
        errors={[
          {
            endpoint: "ListTableIndexes",
            error: query.error,
            label: "Indexes",
          },
        ]}
        onRetry={toolbar.handleRetry}
        tab="indexes"
      />
    );
  }
  if (!query.data || query.isLoading) {
    return <TabSkeleton />;
  }
  const { indexes } = query.data;
  const filteredIndexes = filterIndexesByMethod(indexes, methodFilters);
  return (
    <div className="flex flex-col gap-3">
      {indexes.length > 0 ? (
        <IndexSummaryStrip heapSizeBytes={table?.sizeBytes} indexes={indexes} />
      ) : null}
      <MetadataTabResult
        category="indexes"
        columns={buildIndexInventoryColumns({ schemaName, tableName })}
        data={filteredIndexes}
        filterColumn="name"
        filterPlaceholder="Search indexes…"
        filters={
          <FacetFilterBar
            filters={[
              {
                handleSelectedValuesChange: setMethodFilters,
                label: "Method",
                options: presentIndexMethodOptions(indexes),
                selectedValues: methodFilters,
              },
            ]}
          />
        }
        hasUnfilteredData={indexes.length > 0}
        tableKey="data-explorer-table-indexes"
        toolbar={toolbar}
      />
    </div>
  );
}

export { IndexesTab };
