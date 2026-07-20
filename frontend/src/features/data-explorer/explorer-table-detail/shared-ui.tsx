import type { RowData } from "@tanstack/react-table";
import { RefreshCw, X } from "lucide-react";
import { AppInlineError } from "@/components/app-error-view";
import { EmptyStatePanel } from "@/components/empty-state-panel";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter";
import { Skeleton } from "@/components/ui/skeleton";
import type { MetadataToolbar } from "@/features/data-explorer/explorer-table-detail/metadata";
import {
  type FacetFilterDefinition,
  PILL_TONE_CLASSES,
  type PillTone,
  TABLE_DETAIL_TAB_DEFINITIONS,
} from "@/features/data-explorer/explorer-table-detail/options";
import type { QueryErrorResult } from "@/features/data-explorer/table-detail-query-state";
import type { TableDetailTab } from "@/features/data-explorer/table-detail-tab";
import { useMinimumSpin } from "@/hooks/use-minimum-spin";
import { normalizeAppUiError } from "@/lib/ui-error";
import { cn } from "@/lib/utils";

const SKELETON_ROW_COUNT = 6;
const SKELETON_ROW_IDS = Array.from(
  { length: SKELETON_ROW_COUNT },
  (_, index) => `skeleton-row-${index}`
);

function FacetFilterBar({ filters }: { filters: FacetFilterDefinition[] }) {
  const visibleFilters = filters.filter((filter) => filter.options.length > 0);
  const hasActiveFilter = visibleFilters.some(
    (filter) => filter.selectedValues.length > 0
  );
  if (visibleFilters.length === 0) {
    return null;
  }
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-2"
      data-slot="facet-filter-bar"
    >
      {visibleFilters.map((filter) => (
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
function Pill({
  children,
  mono,
  size = "md",
  title,
  tone,
}: {
  children: React.ReactNode;
  mono?: boolean | undefined;
  size?: "md" | "sm" | undefined;
  title?: string | undefined;
  tone: PillTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded font-semibold uppercase tracking-wider",
        size === "md" && "h-5 px-1.5 text-[10px]",
        size === "sm" && "h-4 px-1 font-mono text-[9px]",
        mono && "font-mono normal-case tracking-normal",
        PILL_TONE_CLASSES[tone]
      )}
      title={title}
    >
      {children}
    </span>
  );
}
function TabSkeleton() {
  return (
    <div className="flex flex-col gap-1 rounded-md border p-2">
      {SKELETON_ROW_IDS.map((rowId) => (
        <Skeleton className="h-6 w-full" key={rowId} />
      ))}
    </div>
  );
}
function TabError({
  errors,
  onRetry,
  tab,
}: {
  errors: QueryErrorResult[];
  onRetry: () => Promise<unknown>;
  tab: TableDetailTab;
}) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {errors.map((queryError) => (
        <AppInlineError
          error={normalizeAppUiError(queryError.error, {
            action: `load_${tab}_metadata`,
            area: `data-explorer.table-detail.${tab}`,
            endpoint: queryError.endpoint,
            source: "query",
            surface: "inline",
          })}
          key={`${queryError.label}-${queryError.endpoint ?? "unknown"}`}
          onRetry={onRetry}
          retryLabel="Retry"
        />
      ))}
    </div>
  );
}
type EmptyResourceCategory = Exclude<TableDetailTab, "data">;
const EMPTY_RESOURCE_COPY: Record<
  EmptyResourceCategory,
  { description: string; title: string }
> = {
  columns: {
    description: "No column metadata was returned for this table.",
    title: "No columns",
  },
  constraints: {
    description:
      "No primary key, foreign key, unique, check, or exclusion constraints were found.",
    title: "No constraints",
  },
  definition: {
    description: "Schema document metadata is not available for this table.",
    title: "No definition",
  },
  indexes: {
    description:
      "This table does not define secondary or primary-key indexes in the current catalog snapshot.",
    title: "No indexes",
  },
  keys: {
    description:
      "No primary, foreign, unique, or secondary index keys were found for this table.",
    title: "No keys",
  },
  partitions: {
    description:
      "Partition metadata appears for partitioned parent tables and child partitions.",
    title: "Table is not partitioned",
  },
  policies: {
    description: "Row-level security policies are not defined for this table.",
    title: "No policies",
  },
  triggers: {
    description: "No triggers are attached to this table.",
    title: "No triggers",
  },
};
// One or more catalog queries back a single tab (Columns and Keys merge a few).
// The toolbar refreshes them together and reports the oldest fetch time so the
// "Last fetched" label never overstates how current the rows are.

function TableResourceEmptyState({
  category,
  toolbar,
}: {
  category: EmptyResourceCategory;
  toolbar: MetadataToolbar;
}) {
  const isSpinning = useMinimumSpin(toolbar.isRefreshing);
  const copy = EMPTY_RESOURCE_COPY[category];
  const Icon = TABLE_DETAIL_TAB_DEFINITIONS[category].icon;
  return (
    <div data-empty-category={category}>
      <EmptyStatePanel
        className="min-h-[220px]"
        description={copy.description}
        headingLevel="h3"
        icon={Icon}
        title={copy.title}
      >
        <div className="flex flex-col items-center gap-2">
          <Button
            disabled={toolbar.isRefreshing}
            onClick={() => {
              toolbar.handleRefresh();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw
              aria-hidden="true"
              className={cn(
                "size-3.5",
                isSpinning && "animate-spin motion-reduce:animate-none"
              )}
            />
            Refresh
          </Button>
          <span aria-live="polite" className="text-muted-foreground text-xs">
            {toolbar.lastFetchedLabel}
          </span>
        </div>
      </EmptyStatePanel>
    </div>
  );
}

function MetadataTabResult<Row extends RowData>({
  category,
  columns,
  data,
  filterColumn,
  filterPlaceholder,
  filters,
  hasUnfilteredData = data.length > 0,
  tableClassName,
  tableKey,
  toolbar,
}: {
  category: EmptyResourceCategory;
  columns: DataTableColumnDef<Row>[];
  data: Row[];
  filterColumn: string;
  filterPlaceholder: string;
  filters?: React.ReactNode;
  hasUnfilteredData?: boolean | undefined;
  tableClassName?: string | undefined;
  tableKey: string;
  toolbar: MetadataToolbar;
}) {
  if (data.length === 0 && !hasUnfilteredData) {
    return <TableResourceEmptyState category={category} toolbar={toolbar} />;
  }
  return (
    <div className="flex flex-col gap-3">
      <DataTable
        columns={columns}
        data={data}
        filterColumn={filterColumn}
        filterPlaceholder={filterPlaceholder}
        isRefreshing={toolbar.isRefreshing}
        lastFetchedLabel={toolbar.lastFetchedLabel}
        onRefresh={toolbar.handleRefresh}
        tableClassName={tableClassName}
        tableKey={tableKey}
        toolbarFilters={filters}
      />
    </div>
  );
}

export {
  FacetFilterBar,
  MetadataTabResult,
  Pill,
  TabError,
  TableResourceEmptyState,
  TabSkeleton,
};
