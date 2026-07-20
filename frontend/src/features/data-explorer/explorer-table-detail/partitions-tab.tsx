import { AlertTriangle, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deriveMetadataToolbar } from "@/features/data-explorer/explorer-table-detail/metadata";
import {
  TabError,
  TableResourceEmptyState,
  TabSkeleton,
} from "@/features/data-explorer/explorer-table-detail/shared-ui";
import {
  derivePartitionViewModel,
  filterPartitionDisplayRows,
  formatPartitionResourceLabel,
  hasPartitionMetadata,
  type PartitionDisplayRow,
  summarizePartitionDisplayRows,
} from "@/features/data-explorer/explorer-table-partitions";
import type { useGetTablePartitionMetadataQuery } from "@/hooks/api/table";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  type PageSize,
  pageIndexForPageSizeChange,
} from "@/lib/pagination";
import { cn } from "@/lib/utils";
import type { TablePartitionMetadata } from "@/protogen/querylane/console/v1alpha1/table_pb";

function partitionShareToneClass(row: PartitionDisplayRow): string {
  if (row.isDefault) {
    return "bg-amber-500";
  }
  if (row.isCurrent) {
    return "bg-emerald-500";
  }
  return "bg-muted-foreground/45";
}
const DEFAULT_PARTITION_PAGE_SIZE = DEFAULT_PAGE_SIZE;
const PARTITION_PAGE_SIZE_OPTIONS = PAGE_SIZE_OPTIONS;
type PartitionPageSize = PageSize;

function isPartitionPageSize(value: number): value is PartitionPageSize {
  return PARTITION_PAGE_SIZE_OPTIONS.some((pageSize) => pageSize === value);
}

function PartitionSummaryItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-card/60 p-3">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className="mt-1 break-words font-mono text-foreground text-xs">
        {value}
      </p>
    </div>
  );
}

function PartitionsToolbar({
  onSearchChange,
  partitionKey,
  search,
}: {
  onSearchChange: (value: string) => void;
  partitionKey: string;
  search: string;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="relative w-52 max-w-full shrink-0">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="Search partitions…"
          className="h-8 pl-8 text-sm"
          name="partition-filter"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search partitions…"
          value={search}
        />
      </div>
      {partitionKey ? (
        <p className="ml-auto min-w-0 truncate text-muted-foreground text-xs">
          Partitioned by{" "}
          <span className="font-mono text-foreground">{partitionKey}</span>
        </p>
      ) : null}
    </div>
  );
}

function PartitionRowsTable({
  rows,
  totalPartitionCount,
  totalRowsLabel,
  totalSizeLabel,
}: {
  rows: PartitionDisplayRow[];
  totalPartitionCount: number;
  totalRowsLabel: string;
  totalSizeLabel: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Partition</TableHead>
            <TableHead>Bounds</TableHead>
            <TableHead className="text-right">Est. rows</TableHead>
            <TableHead className="text-right">Size</TableHead>
            <TableHead className="w-48">Share of rows</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.table}>
              <TableCell className="pl-4">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium font-mono text-sm">
                    {row.name}
                  </span>
                  {row.isCurrent ? (
                    <StatusBadge variant="success">CURRENT</StatusBadge>
                  ) : null}
                  {row.isDefault ? (
                    <StatusBadge variant="warning">DEFAULT</StatusBadge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell
                className="max-w-[28rem] whitespace-normal break-words font-mono text-muted-foreground text-xs"
                title={row.partitionBound}
              >
                {row.boundLabel}
              </TableCell>
              <TableCell className="text-right font-mono">
                {row.rowsLabel}
              </TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">
                {row.sizeLabel}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        row.shareWidthClassName,
                        partitionShareToneClass(row)
                      )}
                    />
                  </div>
                  <span className="w-9 text-right font-mono text-muted-foreground text-xs">
                    {row.shareLabel}
                  </span>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="pl-4 text-muted-foreground" colSpan={2}>
              Total · {totalPartitionCount.toLocaleString()} partitions
            </TableCell>
            <TableCell className="text-right font-mono">
              {totalRowsLabel}
            </TableCell>
            <TableCell className="text-right font-mono">
              {totalSizeLabel}
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function PartitionPaginationFooter({
  hasNext,
  hasPrevious,
  onNext,
  onPageSizeChange,
  onPrevious,
  pageIndex,
  pageSize,
  rowCount,
}: {
  hasNext: boolean;
  hasPrevious: boolean;
  onNext: () => void;
  onPageSizeChange: (value: PartitionPageSize) => void;
  onPrevious: () => void;
  pageIndex: number;
  pageSize: PartitionPageSize;
  rowCount: number;
}) {
  const firstRow = rowCount === 0 ? 0 : pageIndex * pageSize + 1;
  const lastRow = Math.min((pageIndex + 1) * pageSize, rowCount);
  const pageCount = Math.max(1, Math.ceil(rowCount / pageSize));

  return (
    <div className="flex h-8 items-center gap-2 text-muted-foreground text-xs">
      <span className="text-[11px]">Rows per page</span>
      <Select
        onValueChange={(value) => {
          if (typeof value !== "string") {
            return;
          }
          const nextPageSize = Number.parseInt(value, 10);
          if (isPartitionPageSize(nextPageSize)) {
            onPageSizeChange(nextPageSize);
          }
        }}
        value={String(pageSize)}
      >
        <SelectTrigger aria-label="Rows per page" className="h-7" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PARTITION_PAGE_SIZE_OPTIONS.map((size) => (
            <SelectItem key={size} label={String(size)} value={String(size)}>
              {size}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="ml-auto flex items-center gap-1">
        <Button
          aria-label="Previous page"
          className="size-7 p-0"
          disabled={!hasPrevious}
          onClick={onPrevious}
          size="sm"
          type="button"
          variant="outline"
        >
          <ChevronLeft className="size-3" />
        </Button>
        {rowCount > 0 ? (
          <span className="px-1 font-mono tabular-nums">
            Showing {firstRow}–{lastRow} of {rowCount}
          </span>
        ) : null}
        <span className="px-1 font-mono tabular-nums">
          Page {pageIndex + 1} of {pageCount}
        </span>
        <Button
          aria-label="Next page"
          className="size-7 p-0"
          disabled={!hasNext}
          onClick={onNext}
          size="sm"
          type="button"
          variant="outline"
        >
          <ChevronRight className="size-3" />
        </Button>
      </div>
    </div>
  );
}

function partitionSummaryItems(metadata: TablePartitionMetadata) {
  return [
    metadata.partitionKey
      ? { label: "Partition key", value: metadata.partitionKey }
      : null,
    metadata.partitionBound
      ? { label: "Partition bound", value: metadata.partitionBound }
      : null,
    metadata.parentTable
      ? {
          label: "Parent table",
          value: formatPartitionResourceLabel(metadata.parentTable),
        }
      : null,
    {
      label: "Direct partitions",
      value: metadata.partitionCount.toLocaleString(),
    },
  ].filter((item): item is { label: string; value: string } => item !== null);
}

function PartitionsTab({
  query,
}: {
  query: ReturnType<typeof useGetTablePartitionMetadataQuery>;
}) {
  const toolbar = deriveMetadataToolbar([query]);
  const [partitionSearch, setPartitionSearch] = useState("");
  const [partitionPageIndex, setPartitionPageIndex] = useState(0);
  const [partitionPageSize, setPartitionPageSize] = useState<PartitionPageSize>(
    DEFAULT_PARTITION_PAGE_SIZE
  );

  if (query.error) {
    return (
      <TabError
        errors={[
          {
            endpoint: "GetTablePartitionMetadata",
            error: query.error,
            label: "Partitions",
          },
        ]}
        onRetry={toolbar.handleRetry}
        tab="partitions"
      />
    );
  }
  if (!query.data || query.isLoading) {
    return <TabSkeleton />;
  }

  const metadata = query.data.partitionMetadata;
  if (!hasPartitionMetadata(metadata)) {
    return <TableResourceEmptyState category="partitions" toolbar={toolbar} />;
  }

  const { childPartitions } = metadata;
  if (childPartitions.length === 0) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {partitionSummaryItems(metadata).map((item) => (
          <PartitionSummaryItem
            key={item.label}
            label={item.label}
            value={item.value}
          />
        ))}
      </div>
    );
  }

  const partitionModel = derivePartitionViewModel({
    currentDate: new Date(query.dataUpdatedAt),
    partitions: childPartitions,
  });
  const filteredPartitionRows = filterPartitionDisplayRows(
    partitionModel.rows,
    partitionSearch
  );
  const filteredPartitionSummary = summarizePartitionDisplayRows(
    filteredPartitionRows
  );
  const { defaultPartition } = partitionModel;
  const partitionPageCount = Math.max(
    1,
    Math.ceil(filteredPartitionRows.length / partitionPageSize)
  );
  const currentPartitionPageIndex = Math.min(
    partitionPageIndex,
    partitionPageCount - 1
  );
  const paginatedPartitionRows = filteredPartitionRows.slice(
    currentPartitionPageIndex * partitionPageSize,
    (currentPartitionPageIndex + 1) * partitionPageSize
  );
  const showPaginationFooter =
    filteredPartitionRows.length > DEFAULT_PARTITION_PAGE_SIZE;
  function handlePartitionSearchChange(value: string) {
    setPartitionSearch(value);
    setPartitionPageIndex(0);
  }
  function handlePartitionPageSizeChange(value: PartitionPageSize) {
    setPartitionPageIndex(
      pageIndexForPageSizeChange({
        nextPageSize: value,
        pageIndex: currentPartitionPageIndex,
        pageSize: partitionPageSize,
      })
    );
    setPartitionPageSize(value);
  }

  return (
    <div className="flex flex-col gap-3">
      <PartitionsToolbar
        onSearchChange={handlePartitionSearchChange}
        partitionKey={metadata.partitionKey}
        search={partitionSearch}
      />
      <PartitionRowsTable
        rows={paginatedPartitionRows}
        totalPartitionCount={filteredPartitionRows.length}
        totalRowsLabel={filteredPartitionSummary.totalRowsLabel}
        totalSizeLabel={filteredPartitionSummary.totalSizeLabel}
      />
      {defaultPartition && defaultPartition.estimatedRows > 0 ? (
        <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm leading-relaxed">
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300"
          />
          <span>
            The DEFAULT partition holds {defaultPartition.shareLabel} of
            estimated rows ({defaultPartition.rowsLabel}). Rows outside every
            declared range land there until a matching partition exists.
          </span>
        </div>
      ) : null}
      {showPaginationFooter ? (
        <PartitionPaginationFooter
          hasNext={currentPartitionPageIndex + 1 < partitionPageCount}
          hasPrevious={currentPartitionPageIndex > 0}
          onNext={() => {
            setPartitionPageIndex((current) =>
              Math.min(current + 1, partitionPageCount - 1)
            );
          }}
          onPageSizeChange={handlePartitionPageSizeChange}
          onPrevious={() => {
            setPartitionPageIndex((current) => Math.max(current - 1, 0));
          }}
          pageIndex={currentPartitionPageIndex}
          pageSize={partitionPageSize}
          rowCount={filteredPartitionRows.length}
        />
      ) : null}
    </div>
  );
}

export { PartitionsTab };
