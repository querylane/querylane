import { Search } from "lucide-react";
import { useId } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  presentPartitionBoundKindOptions,
  presentPartitionSchemaOptions,
} from "@/features/data-explorer/explorer-table-detail/options";
import { FacetFilterBar } from "@/features/data-explorer/explorer-table-detail/shared-ui";
import type { PartitionDisplayRow } from "@/features/data-explorer/explorer-table-partitions";
import { cn } from "@/lib/utils";

const PARTITION_BAR_TONE_CLASSES: Record<
  PartitionDisplayRow["barTone"],
  string
> = {
  current:
    "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  default:
    "border-amber-500 bg-amber-500/20 text-amber-700 dark:text-amber-300",
  normal: "border-border bg-muted/70 text-muted-foreground",
  selected: "border-primary bg-primary/15 text-primary",
};
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

function PartitionFilterToolbar({
  boundKindFilters,
  onBoundKindFiltersChange,
  onSchemaFiltersChange,
  onSearchChange,
  rows,
  schemaFilters,
  search,
}: {
  boundKindFilters: string[];
  onBoundKindFiltersChange: (values: string[]) => void;
  onSchemaFiltersChange: (values: string[]) => void;
  onSearchChange: (value: string) => void;
  rows: PartitionDisplayRow[];
  schemaFilters: string[];
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
      <FacetFilterBar
        filters={[
          {
            handleSelectedValuesChange: onSchemaFiltersChange,
            label: "Schema",
            options: presentPartitionSchemaOptions(rows),
            selectedValues: schemaFilters,
          },
          {
            handleSelectedValuesChange: onBoundKindFiltersChange,
            label: "Bound kind",
            options: presentPartitionBoundKindOptions(rows),
            selectedValues: boundKindFilters,
          },
        ]}
      />
    </div>
  );
}

function PartitionRowsChart({
  rows,
  selectedPartition,
  onSelectPartition,
}: {
  onSelectPartition: (table: string) => void;
  rows: PartitionDisplayRow[];
  selectedPartition: string | undefined;
}) {
  const headingId = useId();
  const chartRows = rows.filter((row) => !row.isDefault);
  if (chartRows.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby={headingId}
      className="min-w-0 flex-1 rounded-lg border bg-card p-4 shadow-xs"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="font-semibold text-sm" id={headingId}>
          Rows per partition
        </h3>
        <p className="text-muted-foreground text-xs">
          equal time ranges · bar height = rows · click a bar to highlight it
          below
        </p>
      </div>
      <div className="mt-4 flex h-32 items-end gap-2">
        {chartRows.map((row) => (
          <Button
            aria-label={`${row.name}, ${row.rowsLabel} estimated rows`}
            aria-pressed={selectedPartition === row.table}
            className="h-full min-w-0 flex-1 flex-col justify-end gap-1 p-0 hover:bg-transparent"
            key={row.table}
            onClick={() => onSelectPartition(row.table)}
            title={`${row.resourceLabel} · ${row.rowsLabel} rows · ${row.sizeLabel}`}
            type="button"
            variant="ghost"
          >
            <span className="max-w-full truncate font-mono text-[11px] text-muted-foreground">
              {row.rowsLabel}
            </span>
            <span
              aria-hidden="true"
              className="flex h-full w-full flex-col justify-end"
            >
              {row.hasProjection ? (
                <span
                  className={cn(
                    "w-full rounded-t-md border-2 border-emerald-500/70 border-b-0 border-dashed",
                    row.projectedHeightClassName
                  )}
                />
              ) : null}
              <span
                className={cn(
                  "w-full border transition-colors",
                  row.hasProjection ? "rounded-b-md" : "rounded-md",
                  row.barHeightClassName,
                  PARTITION_BAR_TONE_CLASSES[row.barTone]
                )}
              />
            </span>
            <span
              className={cn(
                "max-w-full truncate font-mono text-[11px]",
                row.isCurrent ? "text-emerald-600 dark:text-emerald-300" : ""
              )}
            >
              {row.axisLabel}
            </span>
          </Button>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-2 text-muted-foreground text-xs">
        <span
          aria-hidden="true"
          className="size-3 rounded border border-emerald-500"
        />
        CURRENT · dashed = projected month-end
      </p>
    </section>
  );
}

function DefaultPartitionCard({
  partition,
}: {
  partition: PartitionDisplayRow | undefined;
}) {
  if (!partition) {
    return null;
  }

  return (
    <aside className="flex w-full flex-none flex-col rounded-lg border border-amber-500/50 bg-amber-500/5 p-4 shadow-xs md:w-64">
      <div className="flex items-center gap-2">
        <StatusBadge variant="warning">DEFAULT</StatusBadge>
        <span className="truncate font-mono text-muted-foreground text-xs">
          {partition.name}
        </span>
      </div>
      <div className="mt-4 font-mono font-semibold text-3xl">
        {partition.shareLabel}
      </div>
      <p className="text-muted-foreground text-xs uppercase tracking-wider">
        Of estimated rows · {partition.rowsLabel} · {partition.sizeLabel}
      </p>
      <p className="mt-auto pt-6 text-muted-foreground text-xs leading-relaxed">
        Catches rows outside every defined range. Review before detaching or
        dropping old ranges.
      </p>
    </aside>
  );
}

export {
  DefaultPartitionCard,
  PartitionFilterToolbar,
  PartitionRowsChart,
  PartitionSummaryItem,
};
