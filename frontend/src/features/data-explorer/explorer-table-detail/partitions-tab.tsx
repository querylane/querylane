import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
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
import { isPartitionBoundKind } from "@/features/data-explorer/explorer-table-detail/options";
import {
  DefaultPartitionCard,
  PartitionFilterToolbar,
  PartitionRowsChart,
  PartitionSummaryItem,
} from "@/features/data-explorer/explorer-table-detail/partitions-visuals";
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

const PARTITION_SHARE_TONE_CLASSES: Record<
  PartitionDisplayRow["barTone"],
  string
> = {
  current: "bg-emerald-500",
  default: "bg-amber-500",
  normal: "bg-muted-foreground/45",
  selected: "bg-primary",
};
const DEFAULT_PARTITION_PAGE_SIZE = DEFAULT_PAGE_SIZE;
const PARTITION_PAGE_SIZE_OPTIONS = PAGE_SIZE_OPTIONS;
type PartitionPageSize = PageSize;

function isPartitionPageSize(value: number): value is PartitionPageSize {
  return PARTITION_PAGE_SIZE_OPTIONS.some((pageSize) => pageSize === value);
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
            <TableRow
              data-state={row.barTone === "selected" ? "selected" : undefined}
              key={row.table}
            >
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
              <TableCell className="max-w-[28rem] whitespace-normal break-words font-mono text-muted-foreground text-xs">
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
                        PARTITION_SHARE_TONE_CLASSES[row.barTone]
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
  const [selectedPartition, setSelectedPartition] = useState<
    string | undefined
  >();
  const [partitionSearch, setPartitionSearch] = useState("");
  const [partitionSchemaFilters, setPartitionSchemaFilters] = useState<
    string[]
  >([]);
  const [partitionBoundKindFilters, setPartitionBoundKindFilters] = useState<
    string[]
  >([]);
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
  const partitionModel = derivePartitionViewModel({
    currentDate: new Date(query.dataUpdatedAt),
    partitionKey: metadata.partitionKey,
    partitions: childPartitions,
    selectedPartition,
  });
  const activeBoundKindFilters =
    partitionBoundKindFilters.filter(isPartitionBoundKind);
  const filteredPartitionRows = filterPartitionDisplayRows(
    partitionModel.rows,
    {
      boundKinds: activeBoundKindFilters,
      schemaNames: partitionSchemaFilters,
      search: partitionSearch,
    }
  );
  const filteredPartitionSummary = summarizePartitionDisplayRows(
    filteredPartitionRows
  );
  const filteredDefaultPartition = filteredPartitionRows.find(
    (row) => row.isDefault
  );
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
  function handleSelectPartition(table: string) {
    setSelectedPartition((current) => (current === table ? undefined : table));
  }
  function handlePartitionSearchChange(value: string) {
    setPartitionSearch(value);
    setPartitionPageIndex(0);
  }
  function handlePartitionSchemaFiltersChange(values: string[]) {
    setPartitionSchemaFilters(values);
    setPartitionPageIndex(0);
  }
  function handlePartitionBoundKindFiltersChange(values: string[]) {
    setPartitionBoundKindFilters(values);
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
  const summaryItems = partitionSummaryItems(metadata);

  return (
    <div className="flex flex-col gap-3">
      {childPartitions.length === 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {summaryItems.map((item) => (
            <PartitionSummaryItem
              key={item.label}
              label={item.label}
              value={item.value}
            />
          ))}
        </div>
      ) : null}
      {childPartitions.length > 0 ? (
        <>
          <PartitionFilterToolbar
            boundKindFilters={partitionBoundKindFilters}
            onBoundKindFiltersChange={handlePartitionBoundKindFiltersChange}
            onSchemaFiltersChange={handlePartitionSchemaFiltersChange}
            onSearchChange={handlePartitionSearchChange}
            rows={partitionModel.rows}
            schemaFilters={partitionSchemaFilters}
            search={partitionSearch}
          />
          <div className="flex flex-col gap-3 md:flex-row">
            <PartitionRowsChart
              onSelectPartition={handleSelectPartition}
              rows={filteredPartitionRows}
              selectedPartition={selectedPartition}
            />
            <DefaultPartitionCard partition={filteredDefaultPartition} />
          </div>
          <PartitionRowsTable
            rows={paginatedPartitionRows}
            totalPartitionCount={filteredPartitionRows.length}
            totalRowsLabel={filteredPartitionSummary.totalRowsLabel}
            totalSizeLabel={filteredPartitionSummary.totalSizeLabel}
          />
          {filteredDefaultPartition ? (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm leading-relaxed">
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300"
              />
              <span>
                The DEFAULT partition still holds{" "}
                {filteredDefaultPartition.shareLabel} of estimated rows. Rows
                outside every declared bound land there until a matching
                partition exists.
              </span>
            </div>
          ) : null}
        </>
      ) : null}
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
    </div>
  );
}

export { PartitionsTab };
