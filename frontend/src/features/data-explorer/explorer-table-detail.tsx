"use client";

import { Link } from "@tanstack/react-router";
import type { RowData } from "@tanstack/react-table";
import {
  AlertTriangle,
  Binary,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Columns3,
  FileCode2,
  GitBranch,
  Hash,
  KeyRound,
  Layers,
  ListTree,
  type LucideIcon,
  Network,
  RadioTower,
  RefreshCw,
  Rows3,
  Search,
  ShieldCheck,
  Sparkles,
  Table2,
  Terminal,
  X,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { AppInlineError } from "@/components/app-error-view";
import { PaginationFooter } from "@/components/data-grid/table-data-grid/pagination-footer";
import { TableDataGrid } from "@/components/data-grid/table-data-grid/table-data-grid";
import { EmptyStatePanel } from "@/components/empty-state-panel";
import { SearchEmptyState } from "@/components/search-empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
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
import { Input } from "@/components/ui/input";
import { RefreshControl } from "@/components/ui/refresh-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SqlCodeBlock,
  SqlSyntaxHighlight,
} from "@/components/ui/sql-code-block";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  type ColumnRow,
  deriveColumnRows,
} from "@/features/data-explorer/explorer-column-rows";
import { HeaderStat } from "@/features/data-explorer/explorer-shared-ui";
import {
  type ColumnDefaultFilter,
  type ColumnGenerationFilter,
  type ColumnKeyFilter,
  type ColumnNullabilityFilter,
  columnDefaultKind,
  columnGenerationKinds,
  columnKeyKinds,
  columnNullability,
  columnTypeCategory,
  filterColumnDetailRows,
  filterIndexesByMethod,
  filterPoliciesByMode,
  filterTableTriggers,
  type TriggerStateFilter,
} from "@/features/data-explorer/explorer-table-detail-filters";
import {
  derivePartitionTabCount,
  derivePartitionViewModel,
  filterPartitionDisplayRows,
  formatPartitionResourceLabel,
  hasPartitionMetadata,
  type PartitionBoundKind,
  type PartitionDisplayRow,
  summarizePartitionDisplayRows,
} from "@/features/data-explorer/explorer-table-partitions";
import { formatRows } from "@/features/data-explorer/format-rows";
import { formatLastFetchedLabel } from "@/features/data-explorer/last-fetched-label";
import {
  describePostgresIndexMethod,
  normalizeIndexMethod,
} from "@/features/data-explorer/postgres-index-method-display";
import { describePostgresType } from "@/features/data-explorer/postgres-type-display";
import {
  collectQueryErrors,
  type QueryErrorResult,
} from "@/features/data-explorer/table-detail-query-state";
import {
  isTableDetailTab,
  type TableDetailTab,
} from "@/features/data-explorer/table-detail-tab";
import {
  useGetTablePartitionMetadataQuery,
  useListTableColumnsQuery,
  useListTableConstraintsQuery,
  useListTableIndexesQuery,
  useListTablePoliciesQuery,
  useListTableTriggersQuery,
} from "@/hooks/api/table";
import {
  buildTableName,
  formatBytes,
  normalizeEstimatedRowCount,
  parseResourceLeafId,
  parseTableQualifiedName,
} from "@/lib/console-resources";
import {
  formatPolicyCommand,
  formatPolicyMode,
  formatReferentialAction,
} from "@/lib/protobuf-enums";
import { QUERY_STALE_TIME } from "@/lib/query-policy";
import { normalizeAppUiError } from "@/lib/ui-error";
import { cn } from "@/lib/utils";
import type {
  Column as TableColumn,
  TableConstraint,
  TableIndex,
  TablePartitionMetadata,
  TablePolicy,
  Table as TableProto,
  TableTrigger,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  ConstraintType,
  IdentityGeneration,
  PolicyCommand,
  PolicyMode,
  ReferentialAction,
  Table_TableType,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

const TABLE_METADATA_QUERY_OPTIONS = {
  staleTime: QUERY_STALE_TIME.static,
} as const;
const UNAVAILABLE_COLUMN_STATISTIC_LABEL =
  "Not available from the current column metadata API";
const SKELETON_ROW_COUNT = 6;
const CONSTRAINTS_DEFAULT_PAGE_SIZE = 10;
const CONSTRAINTS_MEDIUM_PAGE_SIZE = 25;
const CONSTRAINTS_LARGE_PAGE_SIZE = 50;
const CONSTRAINTS_PAGE_SIZE_OPTIONS = [
  CONSTRAINTS_DEFAULT_PAGE_SIZE,
  CONSTRAINTS_MEDIUM_PAGE_SIZE,
  CONSTRAINTS_LARGE_PAGE_SIZE,
] as const;
const SKELETON_ROW_IDS = Array.from(
  { length: SKELETON_ROW_COUNT },
  (_, index) => `skeleton-row-${index}`
);
type PillTone = "amber" | "blue" | "emerald" | "slate" | "violet";
const PILL_TONE_CLASSES: Record<PillTone, string> = {
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  slate: "bg-muted text-muted-foreground",
  violet: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
};
const TABLE_TYPE_LABELS: Record<Table_TableType, string> = {
  [Table_TableType.UNSPECIFIED]: "",
  [Table_TableType.BASE_TABLE]: "base table",
  [Table_TableType.TEMPORARY]: "temporary",
  [Table_TableType.EXTERNAL]: "foreign",
  [Table_TableType.PARTITIONED]: "partitioned",
};
const IDENTITY_GENERATION_LABELS = {
  [IdentityGeneration.ALWAYS]: "ALWAYS",
  [IdentityGeneration.BY_DEFAULT]: "BY DEFAULT",
  [IdentityGeneration.UNSPECIFIED]: "",
} satisfies Record<IdentityGeneration, string>;
interface TableDetailTabDefinition {
  icon: LucideIcon;
  label: string;
  value: TableDetailTab;
}
const TABLE_DETAIL_TAB_DEFINITIONS: Record<
  TableDetailTab,
  Omit<TableDetailTabDefinition, "value">
> = {
  columns: { icon: Columns3, label: "Columns" },
  constraints: { icon: GitBranch, label: "Constraints" },
  data: { icon: Rows3, label: "Data" },
  definition: { icon: FileCode2, label: "Definition" },
  indexes: { icon: ListTree, label: "Indexes" },
  keys: { icon: KeyRound, label: "Keys" },
  partitions: { icon: Network, label: "Partitions" },
  policies: { icon: ShieldCheck, label: "Policies" },
  triggers: { icon: RadioTower, label: "Triggers" },
};
const TABLE_DETAIL_TABS: TableDetailTabDefinition[] = [
  { value: "data", ...TABLE_DETAIL_TAB_DEFINITIONS.data },
  { value: "columns", ...TABLE_DETAIL_TAB_DEFINITIONS.columns },
  { value: "keys", ...TABLE_DETAIL_TAB_DEFINITIONS.keys },
  { value: "partitions", ...TABLE_DETAIL_TAB_DEFINITIONS.partitions },
  { value: "indexes", ...TABLE_DETAIL_TAB_DEFINITIONS.indexes },
  { value: "constraints", ...TABLE_DETAIL_TAB_DEFINITIONS.constraints },
  { value: "policies", ...TABLE_DETAIL_TAB_DEFINITIONS.policies },
  { value: "triggers", ...TABLE_DETAIL_TAB_DEFINITIONS.triggers },
  { value: "definition", ...TABLE_DETAIL_TAB_DEFINITIONS.definition },
];
const CONSTRAINT_TYPE_LABELS: Record<ConstraintType, string> = {
  [ConstraintType.UNSPECIFIED]: "—",
  [ConstraintType.PRIMARY_KEY]: "PRIMARY KEY",
  [ConstraintType.UNIQUE]: "UNIQUE",
  [ConstraintType.FOREIGN_KEY]: "FOREIGN KEY",
  [ConstraintType.CHECK]: "CHECK",
  [ConstraintType.EXCLUSION]: "EXCLUSION",
};
interface FacetFilterDefinition {
  handleSelectedValuesChange: (values: string[]) => void;
  label: string;
  options: FacetedFilterOption[];
  selectedValues: string[];
}
type ColumnFacetOption<Value extends string> = FacetedFilterOption & {
  value: Value;
};
const COLUMN_DEFAULT_FILTER_OPTIONS = [
  { label: "Has default", value: "has-default" },
  { label: "No default", value: "no-default" },
] satisfies ColumnFacetOption<ColumnDefaultFilter>[];
const COLUMN_GENERATION_FILTER_OPTIONS = [
  { label: "Identity", value: "identity" },
  { label: "Generated", value: "generated" },
  { label: "Regular", value: "regular" },
] satisfies ColumnFacetOption<ColumnGenerationFilter>[];
const COLUMN_KEY_FILTER_OPTIONS = [
  { label: "Primary key", value: "primary" },
  { label: "Foreign key", value: "foreign" },
  { label: "Unique", value: "unique" },
  { label: "Index", value: "index" },
  { label: "No key", value: "none" },
] satisfies ColumnFacetOption<ColumnKeyFilter>[];
const COLUMN_NULLABILITY_FILTER_OPTIONS = [
  { label: "Not null", value: "not-null" },
  { label: "Nullable", value: "nullable" },
] satisfies ColumnFacetOption<ColumnNullabilityFilter>[];
const PARTITION_BOUND_KIND_LABELS: Record<PartitionBoundKind, string> = {
  default: "Default",
  hash: "Hash",
  list: "List",
  other: "Other",
  range: "Range",
};
const TRIGGER_STATE_FILTER_LABELS: Record<TriggerStateFilter, string> = {
  disabled: "Disabled",
  enabled: "Enabled",
};
const PARTITION_BOUND_KIND_ORDER = [
  "range",
  "list",
  "hash",
  "default",
  "other",
] satisfies PartitionBoundKind[];
function uniqueSortedOptions(values: string[]): FacetedFilterOption[] {
  return Array.from(new Set(values.filter(Boolean)))
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ label: value, value }));
}
function presentColumnOptions<Value extends string>(
  values: Value[],
  options: readonly ColumnFacetOption<Value>[]
): FacetedFilterOption[] {
  const present = new Set(values);
  return options.filter((option) => present.has(option.value));
}
function presentIndexMethodOptions(
  indexes: TableIndex[]
): FacetedFilterOption[] {
  const options = new Map<string, string>();
  for (const index of indexes) {
    const value = normalizeIndexMethod(index.method);
    options.set(value, describePostgresIndexMethod(index.method).label);
  }
  return Array.from(options.entries())
    .sort((left, right) => left[1].localeCompare(right[1]))
    .map(([value, label]) => ({ label, value }));
}
function presentConstraintKindOptions(
  constraints: TableConstraint[]
): FacetedFilterOption[] {
  return Array.from(new Set(constraints.map((constraint) => constraint.type)))
    .sort((left, right) =>
      CONSTRAINT_TYPE_LABELS[left].localeCompare(CONSTRAINT_TYPE_LABELS[right])
    )
    .map((type) => ({
      label: CONSTRAINT_TYPE_LABELS[type],
      value: String(type),
    }));
}
function presentPolicyModeOptions(
  policies: TablePolicy[]
): FacetedFilterOption[] {
  return Array.from(new Set(policies.map((policy) => policy.mode)))
    .sort((left, right) =>
      formatPolicyMode(left).localeCompare(formatPolicyMode(right))
    )
    .map((mode) => ({ label: formatPolicyMode(mode), value: String(mode) }));
}
function presentPartitionSchemaOptions(
  rows: PartitionDisplayRow[]
): FacetedFilterOption[] {
  return uniqueSortedOptions(rows.map((row) => row.schemaName));
}
function presentPartitionBoundKindOptions(
  rows: PartitionDisplayRow[]
): FacetedFilterOption[] {
  const present = new Set(rows.map((row) => row.boundKind));
  const options: FacetedFilterOption[] = [];
  for (const value of PARTITION_BOUND_KIND_ORDER) {
    if (present.has(value)) {
      options.push({ label: PARTITION_BOUND_KIND_LABELS[value], value });
    }
  }
  return options;
}
function presentTriggerStateOptions(
  triggers: TableTrigger[]
): FacetedFilterOption[] {
  const present = new Set<TriggerStateFilter>(
    triggers.map((trigger) => (trigger.enabled ? "enabled" : "disabled"))
  );
  const options: FacetedFilterOption[] = [];
  for (const value of ["enabled", "disabled"] satisfies TriggerStateFilter[]) {
    if (present.has(value)) {
      options.push({ label: TRIGGER_STATE_FILTER_LABELS[value], value });
    }
  }
  return options;
}
function isTriggerStateFilter(value: string): value is TriggerStateFilter {
  return value === "disabled" || value === "enabled";
}
function isPartitionBoundKind(value: string): value is PartitionBoundKind {
  return PARTITION_BOUND_KIND_ORDER.includes(value as PartitionBoundKind);
}
// Table-detail metadata RPCs currently expose parent-scoped lists only.
// These facets intentionally narrow the loaded rows, matching DataTable search.
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
interface RefreshableMetadataQuery {
  dataUpdatedAt: number;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
}
interface MetadataToolbar {
  handleRefresh: () => Promise<unknown>;
  handleRetry: () => Promise<unknown>;
  isRefreshing: boolean;
  lastFetchedLabel: string;
}
function deriveMetadataToolbar(
  queries: RefreshableMetadataQuery[]
): MetadataToolbar {
  const updatedTimes = queries.map((query) => query.dataUpdatedAt || 0);
  const dataUpdatedAt = updatedTimes.includes(0)
    ? 0
    : Math.min(...updatedTimes);
  return {
    handleRefresh: () => Promise.all(queries.map((query) => query.refetch())),
    handleRetry: () => Promise.all(queries.map((query) => query.refetch())),
    isRefreshing: queries.some((query) => query.isFetching),
    lastFetchedLabel: formatLastFetchedLabel(dataUpdatedAt),
  };
}

function MetadataRefreshControl({ toolbar }: { toolbar: MetadataToolbar }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-live="polite" className="text-muted-foreground text-xs">
        {toolbar.lastFetchedLabel}
      </span>
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
            toolbar.isRefreshing && "animate-spin motion-reduce:animate-none"
          )}
        />
        Refresh
      </Button>
    </div>
  );
}

function TableResourceEmptyState({
  category,
  toolbar,
}: {
  category: EmptyResourceCategory;
  toolbar: MetadataToolbar;
}) {
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
                toolbar.isRefreshing &&
                  "animate-spin motion-reduce:animate-none"
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
  pageSize,
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
  pageSize?: number | undefined;
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
        pageSize={pageSize}
        tableClassName={tableClassName}
        tableKey={tableKey}
        toolbarFilters={filters}
      />
    </div>
  );
}

function columnSearchText(row: ColumnRow) {
  const typeMeta = describePostgresType(row.column);
  return [
    row.column.columnName,
    row.column.rawType,
    row.column.defaultValue,
    row.column.comment,
    typeMeta.category,
    typeMeta.summary,
    ...typeMeta.badges,
    ...row.fks.map((fk) => `${fk.table}.${fk.column}`),
  ]
    .join(" ")
    .toLocaleLowerCase();
}

function filterColumnRowsBySearch(rows: ColumnRow[], searchValue: string) {
  const needle = searchValue.trim().toLocaleLowerCase();
  if (!needle) {
    return rows;
  }
  return rows.filter((row) => columnSearchText(row).includes(needle));
}

function ColumnNameCell({ row }: { row: ColumnRow }) {
  const { column, fks, isIndexed } = row;
  const identityLabel = IDENTITY_GENERATION_LABELS[column.identityGeneration];
  const foreignKeyTitle = fks
    .map((fk) => `References ${fk.table}.${fk.column}`)
    .join("; ");
  const showIndexedBadge =
    isIndexed && !(column.isPrimaryKey || column.isUnique || fks.length > 0);
  return (
    <div className="min-w-[14rem]">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-mono font-semibold text-foreground text-xs">
          {column.columnName}
        </span>
        {column.isPrimaryKey ? (
          <Pill size="sm" tone="amber">
            Primary key
          </Pill>
        ) : null}
        {column.isUnique ? (
          <Pill size="sm" tone="emerald">
            Unique
          </Pill>
        ) : null}
        {fks.length > 0 ? (
          <span aria-hidden="true" title={foreignKeyTitle}>
            <Pill size="sm" tone="blue">
              Foreign key
            </Pill>
          </span>
        ) : null}
        {showIndexedBadge ? (
          <Pill size="sm" tone="violet">
            Index
          </Pill>
        ) : null}
        {column.isGenerated ? (
          <Pill size="sm" tone="emerald">
            GENERATED
          </Pill>
        ) : null}
        {column.isIdentity ? (
          <Pill size="sm" tone="amber">
            IDENTITY
          </Pill>
        ) : null}
        {identityLabel ? (
          <Pill size="sm" tone="amber">
            {identityLabel}
          </Pill>
        ) : null}
      </div>
      {column.comment ? (
        <div className="mt-1 max-w-[22rem] truncate text-muted-foreground text-xs">
          {column.comment}
        </div>
      ) : null}
      {column.generationExpression ? (
        <div
          className="mt-1 max-w-[22rem] truncate font-mono text-[11px] text-muted-foreground"
          title={column.generationExpression}
        >
          AS {column.generationExpression}
        </div>
      ) : null}
      {foreignKeyTitle ? (
        <span className="sr-only">{foreignKeyTitle}</span>
      ) : null}
    </div>
  );
}

function ColumnInventoryTypeCell({ column }: { column: TableColumn }) {
  const typeMeta = describePostgresType(column);
  const badgesLabel =
    typeMeta.badges.length > 0 ? ` ${typeMeta.badges.join(" · ")}.` : "";
  return (
    <span
      className="font-mono text-muted-foreground text-xs"
      title={`${typeMeta.category}.${badgesLabel} ${typeMeta.summary}`}
    >
      {typeMeta.displayType}
      <span className="sr-only">
        {`. ${typeMeta.category}.${badgesLabel} ${typeMeta.summary}`}
      </span>
    </span>
  );
}

function ColumnNullFraction({ column }: { column: TableColumn }) {
  return column.isNullable ? <UnavailableColumnStatistic /> : "0%";
}

function UnavailableColumnStatistic() {
  return (
    <span title={UNAVAILABLE_COLUMN_STATISTIC_LABEL}>
      <span aria-hidden="true">-</span>
      <span className="sr-only">{UNAVAILABLE_COLUMN_STATISTIC_LABEL}</span>
    </span>
  );
}

function UnavailableColumnStatisticHeader({
  children,
}: {
  children: React.ReactNode;
}) {
  return <span title={UNAVAILABLE_COLUMN_STATISTIC_LABEL}>{children}</span>;
}

const columnInventoryColumns: DataTableColumnDef<ColumnRow>[] = [
  {
    accessorFn: (row) => row.column.ordinalPosition,
    header: () => (
      <span>
        <span aria-hidden="true">#</span>
        <span className="sr-only">Ordinal position</span>
      </span>
    ),
    id: "ordinalPosition",
    meta: {
      cellClassName: "w-12 font-mono text-muted-foreground text-xs",
      headerClassName: "w-12",
    },
  },
  {
    accessorFn: (row) => row.column.columnName,
    cell: ({ row }) => <ColumnNameCell row={row.original} />,
    header: ({ column }) => (
      <SortableHeader column={column}>Column</SortableHeader>
    ),
    id: "columnName",
    meta: {
      cellClassName: "align-top",
    },
  },
  {
    accessorFn: (row) => row.column.rawType,
    cell: ({ row }) => <ColumnInventoryTypeCell column={row.original.column} />,
    header: ({ column }) => (
      <SortableHeader column={column}>Type</SortableHeader>
    ),
    id: "type",
    meta: {
      cellClassName: "align-top",
    },
  },
  {
    accessorFn: (row) => row.column.isNullable,
    cell: ({ row }) => (row.original.column.isNullable ? "YES" : "NO"),
    header: "Nullable",
    id: "nullable",
    meta: {
      cellClassName: "font-mono text-muted-foreground text-xs",
    },
  },
  {
    accessorFn: (row) => row.column.defaultValue,
    cell: ({ row }) => {
      const defaultValue = row.original.column.defaultValue;
      return defaultValue ? (
        <span title={defaultValue}>{defaultValue}</span>
      ) : (
        "-"
      );
    },
    header: "Default",
    id: "default",
    meta: {
      cellClassName:
        "max-w-[18rem] truncate font-mono text-muted-foreground text-xs",
    },
  },
  {
    cell: () => <UnavailableColumnStatistic />,
    enableSorting: false,
    header: () => (
      <UnavailableColumnStatisticHeader>
        Storage
      </UnavailableColumnStatisticHeader>
    ),
    id: "storage",
    meta: {
      cellClassName: "font-mono text-muted-foreground text-xs",
    },
  },
  {
    cell: () => <UnavailableColumnStatistic />,
    enableSorting: false,
    header: () => (
      <UnavailableColumnStatisticHeader>
        Distinct
      </UnavailableColumnStatisticHeader>
    ),
    id: "distinct",
    meta: {
      cellClassName: "text-right font-mono text-xs",
      headerClassName: "text-right",
    },
  },
  {
    cell: ({ row }) => <ColumnNullFraction column={row.original.column} />,
    enableSorting: false,
    header: "Null %",
    id: "nullFraction",
    meta: {
      cellClassName: "text-right font-mono text-xs",
      headerClassName: "text-right",
    },
  },
  {
    cell: () => <UnavailableColumnStatistic />,
    enableSorting: false,
    header: () => (
      <UnavailableColumnStatisticHeader>
        Avg width
      </UnavailableColumnStatisticHeader>
    ),
    id: "averageWidth",
    meta: {
      cellClassName: "text-right font-mono text-muted-foreground text-xs",
      headerClassName: "text-right",
    },
  },
];

function ColumnsInventoryTable({
  filters,
  hasUnfilteredRows,
  rows,
  toolbar,
}: {
  filters: React.ReactNode;
  hasUnfilteredRows: boolean;
  rows: ColumnRow[];
  toolbar: MetadataToolbar;
}) {
  const [searchValue, setSearchValue] = useState("");
  const visibleRows = filterColumnRowsBySearch(rows, searchValue);

  if (!hasUnfilteredRows) {
    return <TableResourceEmptyState category="columns" toolbar={toolbar} />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-2">
        <DataTableFilter
          onChange={setSearchValue}
          placeholder="Search columns…"
          value={searchValue}
        />
        {filters}
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <span>Catalog metadata</span>
          <span aria-hidden="true">·</span>
          <RefreshControl
            isRefreshing={toolbar.isRefreshing}
            labelClassName="not-sr-only"
            lastFetchedLabel={toolbar.lastFetchedLabel}
            onRefresh={toolbar.handleRefresh}
          />
        </div>
      </div>
      <DataTable
        columns={columnInventoryColumns}
        data={visibleRows}
        emptyResourceName="columns"
        pageSize={10}
        tableClassName="text-sm"
        tableKey="data-explorer-table-columns"
      />
    </div>
  );
}

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

function IndexMethodCell({ method }: { method: string }) {
  const methodMeta = describePostgresIndexMethod(method);
  const Icon = INDEX_METHOD_ICONS[normalizeIndexMethod(method)] ?? Table2;
  return (
    <div
      className="min-w-0 max-w-full [overflow-wrap:anywhere]"
      title={`${methodMeta.label}. ${methodMeta.summary}`}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="font-semibold text-foreground text-xs">
              {methodMeta.label}
            </span>
            <Badge className="h-4 px-1.5 text-[10px]" variant="outline">
              {methodMeta.source}
            </Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
            {methodMeta.summary}
          </p>
        </div>
      </div>
      {methodMeta.badges.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {methodMeta.badges.map((badge) => (
            <Badge
              className="h-4 px-1.5 font-mono text-[9px] text-muted-foreground"
              key={badge}
              variant="secondary"
            >
              {badge}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TableDetailHeader({
  columnCount,
  lastFetchedLabel,
  schemaName,
  table,
  tableName,
}: {
  columnCount: number | undefined;
  lastFetchedLabel: string;
  schemaName: string;
  table: TableProto | undefined;
  tableName: string;
}) {
  const typeLabel = table ? TABLE_TYPE_LABELS[table.tableType] : "";
  const rowsLabel = table
    ? `≈${formatRows(normalizeEstimatedRowCount(table.rowCount))}`
    : "—";
  const sizeLabel = formatBytes(table?.sizeBytes);
  const headerDetails: string[] = [];
  if (columnCount !== undefined) {
    headerDetails.push(`${columnCount.toLocaleString()} columns`);
  }
  if (typeLabel) {
    headerDetails.push(typeLabel);
  }
  if (lastFetchedLabel) {
    headerDetails.push(lastFetchedLabel);
  }
  return (
    <header className="flex flex-col items-start justify-between gap-3 sm:flex-row">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Table2 className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
            Table
          </p>
          <h1
            aria-label={`${schemaName}.${tableName}`}
            className="truncate font-mono font-semibold text-xl"
            title={`${schemaName}.${tableName}`}
          >
            <span className="text-muted-foreground">{schemaName}.</span>
            {tableName}
          </h1>
          {headerDetails.length > 0 ? (
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {headerDetails.join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-5">
        <HeaderStat label="Rows" value={rowsLabel} />
        <HeaderStat label="Size" value={sizeLabel} />
      </div>
    </header>
  );
}
function ColumnsTab({
  columnsQuery,
  constraintsQuery,
  indexesQuery,
}: {
  columnsQuery: ReturnType<typeof useListTableColumnsQuery>;
  constraintsQuery: ReturnType<typeof useListTableConstraintsQuery>;
  indexesQuery: ReturnType<typeof useListTableIndexesQuery>;
}) {
  const [typeCategories, setTypeCategories] = useState<string[]>([]);
  const [keyKinds, setKeyKinds] = useState<string[]>([]);
  const [nullability, setNullability] = useState<string[]>([]);
  const [defaultKinds, setDefaultKinds] = useState<string[]>([]);
  const [generationKinds, setGenerationKinds] = useState<string[]>([]);
  const toolbar = deriveMetadataToolbar([
    columnsQuery,
    constraintsQuery,
    indexesQuery,
  ]);
  const errors = collectQueryErrors(
    {
      endpoint: "ListTableColumns",
      label: "Columns",
      query: columnsQuery,
    },
    {
      endpoint: "ListTableConstraints",
      label: "Constraints",
      query: constraintsQuery,
    },
    {
      endpoint: "ListTableIndexes",
      label: "Indexes",
      query: indexesQuery,
    }
  );
  if (errors.length > 0) {
    return (
      <TabError errors={errors} onRetry={toolbar.handleRetry} tab="columns" />
    );
  }
  if (
    !(columnsQuery.data && constraintsQuery.data && indexesQuery.data) ||
    columnsQuery.isLoading ||
    constraintsQuery.isLoading ||
    indexesQuery.isLoading
  ) {
    return <TabSkeleton />;
  }
  const rows = deriveColumnRows(
    columnsQuery.data.columns,
    constraintsQuery.data.constraints,
    indexesQuery.data.indexes
  );
  const filteredRows = filterColumnDetailRows(rows, {
    defaultKinds: defaultKinds as ColumnDefaultFilter[],
    generationKinds: generationKinds as ColumnGenerationFilter[],
    keyKinds: keyKinds as ColumnKeyFilter[],
    nullability: nullability as ColumnNullabilityFilter[],
    typeCategories,
  });
  return (
    <ColumnsInventoryTable
      filters={
        <FacetFilterBar
          filters={[
            {
              handleSelectedValuesChange: setTypeCategories,
              label: "Type",
              options: uniqueSortedOptions(rows.map(columnTypeCategory)),
              selectedValues: typeCategories,
            },
            {
              handleSelectedValuesChange: setKeyKinds,
              label: "Key",
              options: presentColumnOptions(
                rows.flatMap(columnKeyKinds),
                COLUMN_KEY_FILTER_OPTIONS
              ),
              selectedValues: keyKinds,
            },
            {
              handleSelectedValuesChange: setNullability,
              label: "Nullability",
              options: presentColumnOptions(
                rows.map(columnNullability),
                COLUMN_NULLABILITY_FILTER_OPTIONS
              ),
              selectedValues: nullability,
            },
            {
              handleSelectedValuesChange: setDefaultKinds,
              label: "Default",
              options: presentColumnOptions(
                rows.map(columnDefaultKind),
                COLUMN_DEFAULT_FILTER_OPTIONS
              ),
              selectedValues: defaultKinds,
            },
            {
              handleSelectedValuesChange: setGenerationKinds,
              label: "Generation",
              options: presentColumnOptions(
                rows.flatMap(columnGenerationKinds),
                COLUMN_GENERATION_FILTER_OPTIONS
              ),
              selectedValues: generationKinds,
            },
          ]}
        />
      }
      hasUnfilteredRows={rows.length > 0}
      rows={filteredRows}
      toolbar={toolbar}
    />
  );
}

type TableKeyKind = "foreign" | "primary" | "secondary-index" | "unique";
interface TableKeyRow {
  columnsLabel: string;
  detail: string;
  id: string;
  kind: TableKeyKind;
  kindLabel: string;
  name: string;
  sortRank: number;
}
const TABLE_KEY_KIND_LABELS: Record<TableKeyKind, string> = {
  foreign: "Foreign key",
  primary: "Primary key",
  "secondary-index": "Secondary index",
  unique: "Unique key",
};
const TABLE_KEY_KIND_RANKS: Record<TableKeyKind, number> = {
  foreign: 1,
  primary: 0,
  "secondary-index": 3,
  unique: 2,
};
const TABLE_CONSTRAINT_KEY_KINDS: Record<ConstraintType, TableKeyKind | null> =
  {
    [ConstraintType.UNSPECIFIED]: null,
    [ConstraintType.PRIMARY_KEY]: "primary",
    [ConstraintType.UNIQUE]: "unique",
    [ConstraintType.FOREIGN_KEY]: "foreign",
    [ConstraintType.CHECK]: null,
    [ConstraintType.EXCLUSION]: null,
  };
const BACKING_INDEX_CONSTRAINT_TYPES = new Set<ConstraintType>([
  ConstraintType.PRIMARY_KEY,
  ConstraintType.UNIQUE,
]);
function formatColumnList(columnNames: string[]) {
  return columnNames.length > 0 ? columnNames.join(", ") : "—";
}
function formatIndexColumns(index: TableIndex) {
  const base = `(${index.keyColumns.join(", ")})`;
  if (index.includedColumns.length === 0) {
    return base;
  }
  return `${base} INCLUDE (${index.includedColumns.join(", ")})`;
}
function formatReferencedTable(referencedTable: string) {
  if (!referencedTable) {
    return "";
  }
  try {
    const { schema, table } = parseTableQualifiedName(referencedTable);
    return `${schema}.${table}`;
  } catch {
    return referencedTable;
  }
}
function formatForeignKeyColumns(constraint: TableConstraint) {
  const targetTable = formatReferencedTable(constraint.referencedTable);
  const targetColumns = constraint.referencedColumnNames.join(", ");
  const target = targetColumns
    ? `${targetTable}(${targetColumns})`
    : targetTable;
  if (!target) {
    return formatColumnList(constraint.columnNames);
  }
  return `${formatColumnList(constraint.columnNames)} → ${target}`;
}
function createConstraintKeyRow(
  constraint: TableConstraint,
  kind: TableKeyKind
): TableKeyRow {
  return {
    columnsLabel:
      kind === "foreign"
        ? formatForeignKeyColumns(constraint)
        : formatColumnList(constraint.columnNames),
    detail: constraint.definition || "—",
    id: `constraint:${constraint.constraintName}`,
    kind,
    kindLabel: TABLE_KEY_KIND_LABELS[kind],
    name: constraint.constraintName || "—",
    sortRank: TABLE_KEY_KIND_RANKS[kind],
  };
}
function deriveConstraintKeyRows(constraints: TableConstraint[]): {
  backingConstraintNames: Set<string>;
  rows: TableKeyRow[];
} {
  const backingConstraintNames = new Set<string>();
  const rows: TableKeyRow[] = [];
  for (const constraint of constraints) {
    const kind = TABLE_CONSTRAINT_KEY_KINDS[constraint.type] ?? null;
    if (!kind) {
      continue;
    }
    if (BACKING_INDEX_CONSTRAINT_TYPES.has(constraint.type)) {
      backingConstraintNames.add(constraint.constraintName);
    }
    rows.push(createConstraintKeyRow(constraint, kind));
  }
  return { backingConstraintNames, rows };
}
function createSecondaryIndexKeyRow(index: TableIndex): TableKeyRow {
  const uniqueLabel = index.isUnique ? "Unique " : "";
  return {
    columnsLabel: formatIndexColumns(index),
    detail: `${uniqueLabel}${index.method || "index"}`.trim(),
    id: `index:${index.indexName}`,
    kind: "secondary-index",
    kindLabel: TABLE_KEY_KIND_LABELS["secondary-index"],
    name: index.indexName || "—",
    sortRank: TABLE_KEY_KIND_RANKS["secondary-index"],
  };
}
function sortTableKeyRows(keyRows: TableKeyRow[]) {
  return keyRows.sort((left, right) => {
    if (left.sortRank !== right.sortRank) {
      return left.sortRank - right.sortRank;
    }
    return left.name.localeCompare(right.name);
  });
}
function deriveTableKeyRows(
  constraints: TableConstraint[],
  indexes: TableIndex[]
): TableKeyRow[] {
  const { backingConstraintNames, rows } = deriveConstraintKeyRows(constraints);
  const secondaryIndexRows: TableKeyRow[] = [];
  for (const index of indexes) {
    if (backingConstraintNames.has(index.indexName)) {
      continue;
    }
    secondaryIndexRows.push(createSecondaryIndexKeyRow(index));
  }
  return sortTableKeyRows([...rows, ...secondaryIndexRows]);
}
const keyColumns: DataTableColumnDef<TableKeyRow>[] = [
  {
    accessorFn: (row) => row.kindLabel,
    cell: ({ row }) => (
      <Badge className="font-mono text-[10px]" variant="outline">
        {row.original.kindLabel}
      </Badge>
    ),
    header: ({ column }) => (
      <SortableHeader column={column}>Kind</SortableHeader>
    ),
    id: "kind",
  },
  {
    accessorKey: "name",
    cell: ({ row }) => row.original.name,
    header: ({ column }) => (
      <SortableHeader column={column}>Name</SortableHeader>
    ),
    meta: {
      cellClassName: "font-mono text-xs",
    },
  },
  {
    accessorKey: "columnsLabel",
    cell: ({ row }) => row.original.columnsLabel,
    header: "Columns",
    id: "columns",
    meta: {
      cellClassName: "font-mono text-xs",
    },
  },
  {
    accessorKey: "detail",
    cell: ({ row }) => row.original.detail,
    header: "Detail",
    id: "detail",
    meta: {
      cellClassName: "font-mono text-muted-foreground text-xs",
    },
  },
];
function KeysTab({
  constraintsQuery,
  indexesQuery,
  rows,
}: {
  constraintsQuery: ReturnType<typeof useListTableConstraintsQuery>;
  indexesQuery: ReturnType<typeof useListTableIndexesQuery>;
  rows: TableKeyRow[] | undefined;
}) {
  const [kindFilters, setKindFilters] = useState<string[]>([]);
  const toolbar = deriveMetadataToolbar([constraintsQuery, indexesQuery]);
  const errors = collectQueryErrors(
    {
      endpoint: "ListTableConstraints",
      label: "Constraints",
      query: constraintsQuery,
    },
    {
      endpoint: "ListTableIndexes",
      label: "Indexes",
      query: indexesQuery,
    }
  );
  if (errors.length > 0) {
    return (
      <TabError errors={errors} onRetry={toolbar.handleRetry} tab="keys" />
    );
  }
  if (
    !(constraintsQuery.data && indexesQuery.data) ||
    constraintsQuery.isLoading ||
    indexesQuery.isLoading ||
    !rows
  ) {
    return <TabSkeleton />;
  }
  const filteredRows =
    kindFilters.length === 0
      ? rows
      : rows.filter((row) => kindFilters.includes(row.kind));
  return (
    <MetadataTabResult
      category="keys"
      columns={keyColumns}
      data={filteredRows}
      filterColumn="name"
      filterPlaceholder="Search keys…"
      filters={
        <FacetFilterBar
          filters={[
            {
              handleSelectedValuesChange: setKindFilters,
              label: "Kind",
              options: uniqueSortedOptions(rows.map((row) => row.kind)).map(
                (option) => ({
                  label: TABLE_KEY_KIND_LABELS[option.value as TableKeyKind],
                  value: option.value,
                })
              ),
              selectedValues: kindFilters,
            },
          ]}
        />
      }
      hasUnfilteredData={rows.length > 0}
      tableKey="data-explorer-table-keys"
      toolbar={toolbar}
    />
  );
}

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
const PARTITION_SHARE_TONE_CLASSES: Record<
  PartitionDisplayRow["barTone"],
  string
> = {
  current: "bg-emerald-500",
  default: "bg-amber-500",
  normal: "bg-muted-foreground/45",
  selected: "bg-primary",
};
const PARTITION_PAGE_SIZE_10 = 10;
const PARTITION_PAGE_SIZE_25 = 25;
const PARTITION_PAGE_SIZE_50 = 50;
const PARTITION_PAGE_SIZE_100 = 100;
const DEFAULT_PARTITION_PAGE_SIZE = PARTITION_PAGE_SIZE_10;
const PARTITION_PAGE_SIZE_OPTIONS = [
  PARTITION_PAGE_SIZE_10,
  PARTITION_PAGE_SIZE_25,
  PARTITION_PAGE_SIZE_50,
  PARTITION_PAGE_SIZE_100,
] as const;
type PartitionPageSize = (typeof PARTITION_PAGE_SIZE_OPTIONS)[number];

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
        <SelectContent alignItemWithTrigger={false}>
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
        <span className="px-1 font-mono tabular-nums">
          Showing {firstRow}–{lastRow} of {rowCount}
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

  const childPartitions = metadata.childPartitions;
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
    setPartitionPageSize(value);
    setPartitionPageIndex(0);
  }
  const summaryItems = [
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
    </div>
  );
}

const indexColumns: DataTableColumnDef<TableIndex>[] = [
  {
    accessorKey: "indexName",
    cell: ({ row }) => row.original.indexName,
    header: ({ column }) => (
      <SortableHeader column={column}>Name</SortableHeader>
    ),
    meta: {
      cellClassName:
        "w-[24%] max-w-0 whitespace-normal break-words font-mono text-xs [overflow-wrap:anywhere]",
      headerClassName: "w-[24%] whitespace-normal pl-3",
    },
  },
  {
    accessorKey: "method",
    cell: ({ row }) => <IndexMethodCell method={row.original.method} />,
    header: ({ column }) => (
      <SortableHeader column={column}>Method</SortableHeader>
    ),
    meta: {
      cellClassName: "w-[27%] max-w-0 whitespace-normal align-top",
      headerClassName: "w-[27%] whitespace-normal",
    },
  },
  {
    accessorFn: (row) => row.keyColumns.join(", "),
    cell: ({ row }) => {
      const { keyColumns, includedColumns } = row.original;
      const base = `(${keyColumns.join(", ")})`;
      if (includedColumns.length === 0) {
        return (
          <span className="block whitespace-normal break-words [overflow-wrap:anywhere]">
            {base}
          </span>
        );
      }
      return (
        <span className="block whitespace-normal break-words [overflow-wrap:anywhere]">
          {base} INCLUDE ({includedColumns.join(", ")})
        </span>
      );
    },
    header: "Columns",
    id: "columns",
    meta: {
      cellClassName:
        "w-[31%] max-w-0 whitespace-normal break-words font-mono text-xs leading-relaxed [overflow-wrap:anywhere]",
      headerClassName: "w-[31%] whitespace-normal",
    },
  },
  {
    accessorKey: "isUnique",
    cell: ({ row }) =>
      row.original.isUnique ? (
        "YES"
      ) : (
        <span className="text-muted-foreground">no</span>
      ),
    header: ({ column }) => (
      <SortableHeader column={column}>Unique</SortableHeader>
    ),
    id: "isUnique",
    meta: {
      cellClassName: "w-[9%] whitespace-normal font-mono text-xs",
      headerClassName: "w-[9%] whitespace-normal",
    },
  },
  {
    accessorFn: (row) => Number(row.sizeBytes),
    cell: ({ row }) => formatBytes(row.original.sizeBytes),
    header: ({ column }) => (
      <SortableHeader className="ml-auto" column={column}>
        Size
      </SortableHeader>
    ),
    id: "sizeBytes",
    meta: {
      cellClassName: "w-[9%] whitespace-normal text-right font-mono text-xs",
      headerClassName: "w-[9%] whitespace-normal text-right",
    },
  },
];
function IndexesTab({
  query,
}: {
  query: ReturnType<typeof useListTableIndexesQuery>;
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
  const indexes = query.data.indexes;
  const filteredIndexes = filterIndexesByMethod(indexes, methodFilters);
  return (
    <MetadataTabResult
      category="indexes"
      columns={indexColumns}
      data={filteredIndexes}
      filterColumn="indexName"
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
      tableClassName="table-fixed"
      tableKey="data-explorer-table-indexes"
      toolbar={toolbar}
    />
  );
}
const KEY_CONSTRAINT_TYPES = new Set<ConstraintType>([
  ConstraintType.PRIMARY_KEY,
  ConstraintType.UNIQUE,
]);
const VALIDATED_CONSTRAINT_TYPES = new Set<ConstraintType>([
  ConstraintType.CHECK,
  ConstraintType.FOREIGN_KEY,
]);
const NOT_VALID_DEFINITION_PATTERN = /(?:^|\s)NOT\s+VALID\s*;?\s*$/i;

function isKeyConstraint(constraint: TableConstraint) {
  return KEY_CONSTRAINT_TYPES.has(constraint.type);
}

function isForeignKeyConstraint(constraint: TableConstraint) {
  return constraint.type === ConstraintType.FOREIGN_KEY;
}

function formatConstraintColumns(columnNames: string[]) {
  return columnNames.length > 0 ? columnNames.join(", ") : "—";
}

function shouldShowReferentialAction(action: ReferentialAction) {
  return (
    action !== ReferentialAction.UNSPECIFIED &&
    action !== ReferentialAction.NO_ACTION
  );
}

function hasNotValidDefinition(constraint: TableConstraint) {
  return NOT_VALID_DEFINITION_PATTERN.test(constraint.definition);
}

function parseReferencedTableTarget(referencedTable: string) {
  if (!referencedTable) {
    return null;
  }
  try {
    const { schema, table } = parseTableQualifiedName(referencedTable);
    return { label: `${schema}.${table}`, schema, table };
  } catch {
    return null;
  }
}

function shouldShowValidatedPill(constraint: TableConstraint) {
  return (
    VALIDATED_CONSTRAINT_TYPES.has(constraint.type) &&
    !hasNotValidDefinition(constraint)
  );
}

function ReferencedTableTarget({
  databaseId,
  instanceId,
  referencedTable,
}: {
  databaseId: string;
  instanceId: string;
  referencedTable: string;
}) {
  const target = parseReferencedTableTarget(referencedTable);
  if (!target) {
    return referencedTable ? (
      <ConstraintBadge tone="ghost">
        {parseResourceLeafId(referencedTable)}
      </ConstraintBadge>
    ) : null;
  }
  return (
    <Link
      className="inline-flex h-[18px] items-center rounded-sm font-mono text-[11.5px] text-blue-700 focus-visible:ring-2 focus-visible:ring-ring dark:text-blue-300"
      params={{ databaseId, instanceId }}
      search={{
        category: "tables",
        name: target.table,
        schema: target.schema,
      }}
      to="/instances/$instanceId/databases/$databaseId/explorer"
    >
      {target.label}
      <span aria-hidden="true">&nbsp;↗</span>
    </Link>
  );
}

function ConstraintBadge({
  children,
  tone = "secondary",
}: {
  children: React.ReactNode;
  tone?: "ghost" | "outline" | "secondary" | "warning" | undefined;
}) {
  return (
    <Badge
      className={cn(
        "h-[18px] font-mono text-[10px]",
        tone === "ghost" && "border-transparent text-muted-foreground",
        tone === "warning" &&
          "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300"
      )}
      variant={tone === "outline" ? "outline" : "secondary"}
    >
      {children}
    </Badge>
  );
}

function ReferentialActionPill({
  action,
  label,
}: {
  action: ReferentialAction;
  label: "delete" | "update";
}) {
  if (!shouldShowReferentialAction(action)) {
    return null;
  }
  const actionLabel = formatReferentialAction(action);
  return (
    <ConstraintBadge
      tone={action === ReferentialAction.CASCADE ? "warning" : "outline"}
    >
      ON {label.toUpperCase()} {actionLabel}
    </ConstraintBadge>
  );
}

function ConstraintSectionHeading({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <h2 className="flex flex-wrap items-baseline gap-2 font-semibold text-[12.5px]">
      <span>{title}</span>
      <span className="font-normal text-[11px] text-muted-foreground">
        {description}
      </span>
    </h2>
  );
}

function ConstraintCard({
  constraint,
  databaseId,
  instanceId,
}: {
  constraint: TableConstraint;
  databaseId: string;
  instanceId: string;
}) {
  const isForeignKey = isForeignKeyConstraint(constraint);
  const fallbackDefinition = `${CONSTRAINT_TYPE_LABELS[constraint.type]} (${formatConstraintColumns(
    constraint.columnNames
  )})`;
  return (
    <article
      className={cn(
        "rounded-[10px] border bg-card px-3.5 py-[11px] shadow-xs",
        hasNotValidDefinition(constraint) &&
          "border-amber-500/45 dark:border-amber-400/45"
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="break-all font-mono font-semibold text-[12.5px]">
          {constraint.constraintName || "—"}
        </h3>
        <ConstraintBadge>
          {CONSTRAINT_TYPE_LABELS[constraint.type]}
        </ConstraintBadge>
        {isForeignKey ? (
          <>
            <ReferentialActionPill
              action={constraint.onDelete}
              label="delete"
            />
            <ReferentialActionPill
              action={constraint.onUpdate}
              label="update"
            />
          </>
        ) : null}
        {hasNotValidDefinition(constraint) ? (
          <ConstraintBadge tone="warning">NOT VALID</ConstraintBadge>
        ) : null}
        {shouldShowValidatedPill(constraint) ? (
          <ConstraintBadge tone="ghost">validated</ConstraintBadge>
        ) : null}
        {isForeignKey ? (
          <ReferencedTableTarget
            databaseId={databaseId}
            instanceId={instanceId}
            referencedTable={constraint.referencedTable}
          />
        ) : null}
      </div>
      {constraint.definition ? (
        <SqlCodeBlock
          className="mt-[7px] whitespace-pre-wrap rounded-none border-0 bg-transparent p-0 text-[11.5px] text-muted-foreground leading-[1.55] [overflow-wrap:anywhere]"
          copyable={false}
          sql={constraint.definition}
        />
      ) : (
        <p className="mt-[7px] break-words font-mono text-[11.5px] text-muted-foreground leading-[1.55] [overflow-wrap:anywhere]">
          {fallbackDefinition}
        </p>
      )}
    </article>
  );
}

function ConstraintSection({
  constraints,
  databaseId,
  description,
  instanceId,
  title,
}: {
  constraints: TableConstraint[];
  databaseId: string;
  description: string;
  instanceId: string;
  title: string;
}) {
  if (constraints.length === 0) {
    return null;
  }
  return (
    <section className="space-y-2">
      <ConstraintSectionHeading description={description} title={title} />
      <div className="space-y-2">
        {constraints.map((constraint, index) => (
          <ConstraintCard
            constraint={constraint}
            databaseId={databaseId}
            instanceId={instanceId}
            key={
              constraint.constraintName ||
              `${constraint.type}:${constraint.definition}:${index}`
            }
          />
        ))}
      </div>
    </section>
  );
}

function ConstraintsTab({
  databaseId,
  instanceId,
  query,
}: {
  databaseId: string;
  instanceId: string;
  query: ReturnType<typeof useListTableConstraintsQuery>;
}) {
  const [kindFilters, setKindFilters] = useState<string[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(CONSTRAINTS_DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const toolbar = deriveMetadataToolbar([query]);
  if (query.error) {
    return (
      <TabError
        errors={[
          {
            endpoint: "ListTableConstraints",
            error: query.error,
            label: "Constraints",
          },
        ]}
        onRetry={toolbar.handleRetry}
        tab="constraints"
      />
    );
  }
  if (!query.data || query.isLoading) {
    return <TabSkeleton />;
  }
  const constraints = query.data.constraints;
  if (constraints.length === 0) {
    return <TableResourceEmptyState category="constraints" toolbar={toolbar} />;
  }
  const normalizedSearch = search.trim().toLowerCase();
  const visibleConstraints = constraints.filter(
    (constraint) =>
      (normalizedSearch.length === 0 ||
        constraint.constraintName.toLowerCase().includes(normalizedSearch)) &&
      (kindFilters.length === 0 ||
        kindFilters.includes(String(constraint.type)))
  );
  const orderedConstraints = [
    ...visibleConstraints.filter(isKeyConstraint),
    ...visibleConstraints.filter(isForeignKeyConstraint),
    ...visibleConstraints.filter(
      (constraint) => constraint.type === ConstraintType.CHECK
    ),
    ...visibleConstraints.filter(
      (constraint) =>
        !(
          isKeyConstraint(constraint) ||
          isForeignKeyConstraint(constraint) ||
          constraint.type === ConstraintType.CHECK
        )
    ),
  ];
  const pageCount = Math.ceil(visibleConstraints.length / pageSize);
  const currentPageIndex = Math.min(pageIndex, Math.max(pageCount - 1, 0));
  const pageStart = currentPageIndex * pageSize;
  const pageConstraints = orderedConstraints.slice(
    pageStart,
    pageStart + pageSize
  );
  const keyConstraints = pageConstraints.filter(isKeyConstraint);
  const foreignKeyConstraints = pageConstraints.filter(isForeignKeyConstraint);
  const checkConstraints = pageConstraints.filter(
    (constraint) => constraint.type === ConstraintType.CHECK
  );
  const otherConstraints = pageConstraints.filter(
    (constraint) =>
      !(
        isKeyConstraint(constraint) ||
        isForeignKeyConstraint(constraint) ||
        constraint.type === ConstraintType.CHECK
      )
  );
  return (
    <div className="space-y-3.5" data-slot="constraints-card-list">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <div
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
          data-slot="constraints-filter-controls"
        >
          <DataTableFilter
            onChange={(value) => {
              setSearch(value);
              setPageIndex(0);
            }}
            placeholder="Search constraints…"
            value={search}
          />
          <FacetFilterBar
            filters={[
              {
                handleSelectedValuesChange: (values) => {
                  setKindFilters(values);
                  setPageIndex(0);
                },
                label: "Kind",
                options: presentConstraintKindOptions(constraints),
                selectedValues: kindFilters,
              },
            ]}
          />
        </div>
        <MetadataRefreshControl toolbar={toolbar} />
      </div>
      {visibleConstraints.length === 0 ? (
        <SearchEmptyState resourceName="constraints" />
      ) : (
        <>
          <ConstraintSection
            constraints={keyConstraints}
            databaseId={databaseId}
            description="primary key and uniqueness"
            instanceId={instanceId}
            title="Keys"
          />
          <ConstraintSection
            constraints={foreignKeyConstraints}
            databaseId={databaseId}
            description="outbound references from this table"
            instanceId={instanceId}
            title="Foreign keys"
          />
          <ConstraintSection
            constraints={checkConstraints}
            databaseId={databaseId}
            description="row-level validation rules"
            instanceId={instanceId}
            title="Checks"
          />
          <ConstraintSection
            constraints={otherConstraints}
            databaseId={databaseId}
            description="exclusion and other rules"
            instanceId={instanceId}
            title="Other constraints"
          />
          {constraints.length > CONSTRAINTS_DEFAULT_PAGE_SIZE ? (
            <nav
              aria-label="Constraints pagination"
              className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs"
            >
              <span className="tabular-nums" role="status">
                Showing {pageStart + 1}&ndash;
                {Math.min(pageStart + pageSize, visibleConstraints.length)} of{" "}
                {visibleConstraints.length}
              </span>
              <div className="ml-auto">
                <PaginationFooter
                  hasNext={currentPageIndex < pageCount - 1}
                  hasPrev={currentPageIndex > 0}
                  onNext={() => setPageIndex(currentPageIndex + 1)}
                  onPageSizeChange={(nextPageSize) => {
                    setPageSize(nextPageSize);
                    setPageIndex(0);
                  }}
                  onPrev={() => setPageIndex(currentPageIndex - 1)}
                  pageIndex={currentPageIndex}
                  pageLabel={`Page ${currentPageIndex + 1} of ${pageCount}`}
                  pageSize={pageSize}
                  pageSizeLabel="Constraints per page"
                  pageSizeOptions={CONSTRAINTS_PAGE_SIZE_OPTIONS}
                />
              </div>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
const PREVIEW_POLICY_COMMANDS: PolicyCommand[] = [
  PolicyCommand.SELECT,
  PolicyCommand.INSERT,
  PolicyCommand.UPDATE,
  PolicyCommand.DELETE,
];

function policyModeLabel(mode: PolicyMode) {
  switch (mode) {
    case PolicyMode.RESTRICTIVE:
      return "RESTRICTIVE";
    case PolicyMode.PERMISSIVE:
      return "PERMISSIVE";
    default:
      return "UNKNOWN";
  }
}

function policyModeBadgeClassName(mode: PolicyMode) {
  return mode === PolicyMode.RESTRICTIVE
    ? "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300"
    : "border-transparent bg-muted text-muted-foreground";
}

function policyRoles(policy: TablePolicy) {
  return policy.roles.length > 0 ? policy.roles : ["public"];
}

function formatPolicyRoles(policy: TablePolicy) {
  return policyRoles(policy).join(", ");
}

function collectPolicyRoles(policies: TablePolicy[]) {
  const roles: string[] = [];
  const seen = new Set<string>();
  for (const policy of policies) {
    for (const role of policyRoles(policy)) {
      if (!seen.has(role)) {
        seen.add(role);
        roles.push(role);
      }
    }
  }
  return roles.length > 0 ? roles : ["public"];
}

const SMALL_POLICY_PAGE_SIZE = 6;
const MEDIUM_POLICY_PAGE_SIZE = 12;
const LARGE_POLICY_PAGE_SIZE = 24;
const POLICY_PAGE_SIZE_OPTIONS = [
  SMALL_POLICY_PAGE_SIZE,
  MEDIUM_POLICY_PAGE_SIZE,
  LARGE_POLICY_PAGE_SIZE,
] as const;
type PolicyPageSize = (typeof POLICY_PAGE_SIZE_OPTIONS)[number];

function isPolicyPageSize(value: number): value is PolicyPageSize {
  return POLICY_PAGE_SIZE_OPTIONS.some((pageSize) => pageSize === value);
}

function policyAppliesToRole(policy: TablePolicy, role: string) {
  const roles = policyRoles(policy);
  return roles.includes("public") || roles.includes(role);
}

function policyAppliesToCommand(policy: TablePolicy, command: PolicyCommand) {
  return policy.command === PolicyCommand.ALL || policy.command === command;
}

function policyPredicateForCommand(
  policy: TablePolicy,
  command: PolicyCommand
) {
  const usingExpression = policy.usingExpression.trim();
  const checkExpression = policy.checkExpression.trim();
  switch (command) {
    case PolicyCommand.INSERT:
      return checkExpression || usingExpression || "true";
    case PolicyCommand.UPDATE:
    case PolicyCommand.DELETE:
    case PolicyCommand.SELECT:
      return usingExpression || "true";
    default:
      return usingExpression || checkExpression || "true";
  }
}

function wrapPolicyPredicate(predicate: string) {
  return predicate === "true" ? predicate : `(${predicate})`;
}

function joinPolicyPredicates(predicates: string[], operator: "AND" | "OR") {
  return predicates.map(wrapPolicyPredicate).join(`\n${operator} `);
}

interface RlsPreviewModel {
  appliedPolicies: TablePolicy[];
  hasRows: boolean;
  predicate: string;
  verdict: string;
}

function deriveRlsPreview({
  command,
  policies,
  role,
}: {
  command: PolicyCommand;
  policies: TablePolicy[];
  role: string;
}): RlsPreviewModel {
  const matchingPolicies = policies.filter(
    (policy) =>
      policyAppliesToRole(policy, role) &&
      policyAppliesToCommand(policy, command)
  );
  const permissivePolicies = matchingPolicies.filter(
    (policy) => policy.mode !== PolicyMode.RESTRICTIVE
  );
  const restrictivePolicies = matchingPolicies.filter(
    (policy) => policy.mode === PolicyMode.RESTRICTIVE
  );
  if (permissivePolicies.length === 0) {
    return {
      appliedPolicies: matchingPolicies,
      hasRows: false,
      predicate: "",
      verdict:
        command === PolicyCommand.INSERT
          ? `No permissive policy applies — RLS rejects every INSERT by ${role}.`
          : `No permissive policy applies — RLS returns zero rows for ${role} running ${formatPolicyCommand(command)}.`,
    };
  }

  const permissivePredicate = joinPolicyPredicates(
    permissivePolicies.map((policy) =>
      policyPredicateForCommand(policy, command)
    ),
    "OR"
  );
  const restrictivePredicates = restrictivePolicies.map((policy) =>
    policyPredicateForCommand(policy, command)
  );
  const predicate =
    restrictivePredicates.length > 0
      ? [
          permissivePolicies.length === 1
            ? permissivePredicate
            : `(${permissivePredicate})`,
          ...restrictivePredicates.map(wrapPolicyPredicate),
        ].join("\nAND ")
      : permissivePredicate;
  const permissiveLabel =
    permissivePolicies.length === 1
      ? "1 permissive policy applies"
      : `${permissivePolicies.length.toLocaleString()} permissive policies apply`;
  const rowSubject = command === PolicyCommand.INSERT ? "a new row" : "a row";
  const matchCondition =
    permissivePolicies.length === 1 ? "if it matches" : "if any one matches";
  const passCopy = `${rowSubject} passes ${matchCondition}`;
  const restrictiveCopy =
    restrictivePolicies.length > 0
      ? ` ${restrictivePolicies.length.toLocaleString()} restrictive ${
          restrictivePolicies.length === 1 ? "policy" : "policies"
        } must also pass.`
      : "";

  return {
    appliedPolicies: matchingPolicies,
    hasRows: true,
    predicate,
    verdict: `${permissiveLabel} — ${passCopy}.${restrictiveCopy} ${
      command === PolicyCommand.INSERT
        ? `New rows inserted by ${role} must satisfy:`
        : `Rows visible to ${role} are those where:`
    }`,
  };
}

function PolicyExpression({ expression }: { expression: string }) {
  return (
    <SqlCodeBlock
      className="mt-1"
      copyable={false}
      sql={expression}
      variant="compact"
    />
  );
}

function PolicyCard({ policy }: { policy: TablePolicy }) {
  return (
    <article className="rounded-lg border bg-card p-3 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-mono font-semibold text-sm">{policy.policyName}</h2>
        <Badge className="h-[18px] font-mono text-[10px]" variant="outline">
          FOR {formatPolicyCommand(policy.command)}
        </Badge>
        <Badge
          className={cn(
            "h-[18px] font-mono text-[10px]",
            policyModeBadgeClassName(policy.mode)
          )}
          variant="secondary"
        >
          {policyModeLabel(policy.mode)}
        </Badge>
        <span className="ml-auto font-mono text-muted-foreground text-xs">
          TO {formatPolicyRoles(policy)}
        </span>
      </div>
      {policy.usingExpression ? (
        <div className="mt-3">
          <div className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
            USING
          </div>
          <PolicyExpression expression={policy.usingExpression} />
        </div>
      ) : null}
      {policy.checkExpression ? (
        <div className="mt-2">
          <div className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
            WITH CHECK
          </div>
          <PolicyExpression expression={policy.checkExpression} />
        </div>
      ) : null}
    </article>
  );
}

function RlsCombinationGuide() {
  return (
    <section className="rounded-lg border bg-card p-4 shadow-xs">
      <h2 className="font-semibold text-sm">How the server combines these</h2>
      <ol className="mt-3 flex list-none flex-col gap-2 pl-0 text-muted-foreground text-sm leading-relaxed">
        <li>
          <span className="font-medium text-foreground">1 · Grants first.</span>{" "}
          A role with no SELECT grant sees nothing; RLS never even runs.
        </li>
        <li>
          <span className="font-medium text-foreground">
            2 · PERMISSIVE policies OR together.
          </span>{" "}
          A row is visible if any one matches.
        </li>
        <li>
          <span className="font-medium text-foreground">
            3 · RESTRICTIVE policies AND on top.
          </span>{" "}
          Every one must also pass.
        </li>
        <li>
          <span className="font-medium text-foreground">
            4 · No matching policy = zero rows.
          </span>{" "}
          RLS is default-deny, not default-allow.
        </li>
        <li>
          <span className="font-medium text-foreground">
            5 · Owner and BYPASSRLS skip it
          </span>{" "}
          unless FORCE ROW LEVEL SECURITY is set.
        </li>
      </ol>
    </section>
  );
}

function RlsPreview({ policies }: { policies: TablePolicy[] }) {
  const roleOptions = collectPolicyRoles(policies);
  const [selectedRole, setSelectedRole] = useState(roleOptions[0] ?? "public");
  const [selectedCommand, setSelectedCommand] = useState(PolicyCommand.SELECT);
  const activeRole = roleOptions.includes(selectedRole)
    ? selectedRole
    : (roleOptions[0] ?? "public");
  const previewCommand = PREVIEW_POLICY_COMMANDS.includes(selectedCommand)
    ? selectedCommand
    : PolicyCommand.SELECT;
  const preview = deriveRlsPreview({
    command: previewCommand,
    policies,
    role: activeRole,
  });
  function handleRoleChange(value: string | null) {
    if (value) {
      setSelectedRole(value);
    }
  }
  function handleCommandChange(value: string | null) {
    if (value) {
      setSelectedCommand(Number(value) as PolicyCommand);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold text-sm">Preview visibility as</h2>
        <Select onValueChange={handleRoleChange} value={activeRole}>
          <SelectTrigger
            aria-label="Policy role"
            className="h-8 min-w-44 font-mono"
            size="sm"
          >
            <SelectValue>{activeRole}</SelectValue>
          </SelectTrigger>
          <SelectContent align="start">
            {roleOptions.map((role) => (
              <SelectItem key={role} label={role} value={role}>
                {role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-sm">running</span>
        <Select
          onValueChange={handleCommandChange}
          value={String(previewCommand)}
        >
          <SelectTrigger
            aria-label="Policy command"
            className="h-8 min-w-32 font-mono"
            size="sm"
          >
            <SelectValue>{formatPolicyCommand(previewCommand)}</SelectValue>
          </SelectTrigger>
          <SelectContent align="start">
            {PREVIEW_POLICY_COMMANDS.map((command) => (
              <SelectItem
                key={command}
                label={formatPolicyCommand(command)}
                value={String(command)}
              >
                {formatPolicyCommand(command)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div aria-atomic="true" aria-live="polite">
        <div
          className={cn(
            "mt-4 flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm leading-relaxed",
            preview.hasRows
              ? "bg-emerald-500/10 text-foreground"
              : "bg-amber-500/10 text-foreground"
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "mt-1.5 size-2 shrink-0 rounded-full",
              preview.hasRows ? "bg-emerald-500" : "bg-amber-500"
            )}
          />
          <span>{preview.verdict}</span>
        </div>

        {preview.hasRows ? (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                Applied
              </span>
              {preview.appliedPolicies.map((policy) => (
                <Badge
                  className="h-5 font-mono text-[10px]"
                  key={policy.policyName}
                  variant="secondary"
                >
                  {policy.policyName}
                </Badge>
              ))}
            </div>
            <PolicyExpression expression={preview.predicate} />
          </>
        ) : null}
      </div>
    </section>
  );
}

function PoliciesTab({
  query,
}: {
  query: ReturnType<typeof useListTablePoliciesQuery>;
}) {
  const [policySearch, setPolicySearch] = useState("");
  const [modeFilters, setModeFilters] = useState<string[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<PolicyPageSize>(
    SMALL_POLICY_PAGE_SIZE
  );
  const toolbar = deriveMetadataToolbar([query]);
  if (query.error) {
    return (
      <TabError
        errors={[
          {
            endpoint: "ListTablePolicies",
            error: query.error,
            label: "Policies",
          },
        ]}
        onRetry={toolbar.handleRetry}
        tab="policies"
      />
    );
  }
  if (!query.data || query.isLoading) {
    return <TabSkeleton />;
  }
  const policies = query.data.policies;
  if (policies.length === 0) {
    return <TableResourceEmptyState category="policies" toolbar={toolbar} />;
  }
  const normalizedSearch = policySearch.trim().toLocaleLowerCase();
  const visiblePolicies = filterPoliciesByMode(
    policies,
    modeFilters.map(Number) as PolicyMode[]
  ).filter((policy) =>
    policy.policyName.toLocaleLowerCase().includes(normalizedSearch)
  );
  const pageCount = Math.max(1, Math.ceil(visiblePolicies.length / pageSize));
  const currentPageIndex = Math.min(pageIndex, pageCount - 1);
  const pagePolicies = visiblePolicies.slice(
    currentPageIndex * pageSize,
    (currentPageIndex + 1) * pageSize
  );
  const firstPolicy = currentPageIndex * pageSize + 1;
  const lastPolicy = Math.min(
    (currentPageIndex + 1) * pageSize,
    visiblePolicies.length
  );

  function handlePolicySearchChange(nextSearch: string) {
    setPageIndex(0);
    setPolicySearch(nextSearch);
  }

  function handlePolicyModeFiltersChange(nextModeFilters: string[]) {
    setPageIndex(0);
    setModeFilters(nextModeFilters);
  }

  return (
    <div className="flex flex-col gap-3" data-slot="policies-tab">
      <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-xs">
        <span
          aria-hidden="true"
          className="size-2 rounded-full bg-emerald-500"
        />
        <p className="font-medium text-sm">
          This table defines row-level security policies; table owners and
          BYPASSRLS roles may bypass them
        </p>
        <span
          aria-live="polite"
          className="ml-auto text-muted-foreground text-xs"
        >
          {toolbar.lastFetchedLabel}
        </span>
      </div>
      <div className="flex min-h-8 flex-wrap items-center gap-2">
        <DataTableFilter
          onChange={handlePolicySearchChange}
          placeholder="Search policies…"
          value={policySearch}
        />
        <FacetFilterBar
          filters={[
            {
              handleSelectedValuesChange: handlePolicyModeFiltersChange,
              label: "Mode",
              options: presentPolicyModeOptions(policies),
              selectedValues: modeFilters,
            },
          ]}
        />
      </div>
      {pagePolicies.length > 0 ? (
        <div className="flex flex-col gap-3">
          {pagePolicies.map((policy) => (
            <PolicyCard key={policy.policyName} policy={policy} />
          ))}
        </div>
      ) : (
        <SearchEmptyState className="border" resourceName="policies" />
      )}
      {visiblePolicies.length > 0 ? (
        <fieldset
          aria-label="Policies pagination"
          className="m-0 flex min-h-8 min-w-0 flex-wrap items-center gap-2 border-0 p-0 text-muted-foreground text-xs"
        >
          <span className="text-[11px]">Rows per page</span>
          <Select
            onValueChange={(nextValue) => {
              if (typeof nextValue !== "string") {
                return;
              }
              const nextPageSize = Number(nextValue);
              if (isPolicyPageSize(nextPageSize)) {
                setPageIndex(0);
                setPageSize(nextPageSize);
              }
            }}
            value={String(pageSize)}
          >
            <SelectTrigger
              aria-label="Rows per page"
              className="h-7 w-16"
              size="sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {POLICY_PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem
                  key={size}
                  label={String(size)}
                  value={String(size)}
                >
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="tabular-nums">
            Showing {firstPolicy}&ndash;{lastPolicy} of {visiblePolicies.length}{" "}
            policies
          </span>
          <span
            aria-atomic="true"
            aria-live="polite"
            className="sr-only"
            role="status"
          >
            Showing {firstPolicy}&ndash;{lastPolicy} of {visiblePolicies.length}{" "}
            policies. Page {currentPageIndex + 1} of {pageCount}.
          </span>
          <nav
            aria-label="Policy pages"
            className="ml-auto flex items-center gap-2"
          >
            <Button
              aria-label="Previous policies page"
              className="size-7 p-0"
              disabled={currentPageIndex === 0}
              onClick={() => {
                setPageIndex(Math.max(0, currentPageIndex - 1));
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <ChevronLeft className="size-3" />
            </Button>
            <span className="font-mono text-xs">
              Page {currentPageIndex + 1} of {pageCount}
            </span>
            <Button
              aria-label="Next policies page"
              className="size-7 p-0"
              disabled={currentPageIndex >= pageCount - 1}
              onClick={() => {
                setPageIndex(Math.min(pageCount - 1, currentPageIndex + 1));
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <ChevronRight className="size-3" />
            </Button>
          </nav>
        </fieldset>
      ) : null}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <RlsCombinationGuide />
        <RlsPreview policies={policies} />
      </div>
    </div>
  );
}
const SIMPLE_SQL_IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;
const CREATE_TRIGGER_RE = /^CREATE\s+(?:CONSTRAINT\s+)?TRIGGER\b/i;
const EXECUTE_FUNCTION_RE = /EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+([^;]+);?$/i;
const EXECUTE_FUNCTION_PREFIX_RE = /^EXECUTE\s+(?:FUNCTION|PROCEDURE)\b/i;
const TRIGGER_SQL_FOR_EACH_RE = /\s+FOR\s+EACH\s+/i;
const TRIGGER_SCOPE_RE = /FOR\s+EACH\s+(ROW|STATEMENT)\b/i;
const TRIGGER_WHEN_RE =
  /\bWHEN\s*\(([\s\S]+)\)\s+EXECUTE\s+(?:FUNCTION|PROCEDURE)\b/i;
const TRIGGER_SQL_COPY_FEEDBACK_MS = 1500;

/** Leaves simple names bare to mirror pg_get_triggerdef output. */
function formatTriggerSqlIdentifier(identifier: string) {
  if (SIMPLE_SQL_IDENTIFIER_RE.test(identifier)) {
    return identifier;
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

function formatTriggerTableName(schemaName: string, tableName: string) {
  return `${formatTriggerSqlIdentifier(schemaName)}.${formatTriggerSqlIdentifier(
    tableName
  )}`;
}

function ensureSqlTerminator(sql: string) {
  const trimmed = sql.trim();
  return trimmed.endsWith(";") ? trimmed : `${trimmed};`;
}

function formatTriggerFunctionCall(trigger: TableTrigger) {
  const definition = trigger.definition.trim();
  if (EXECUTE_FUNCTION_PREFIX_RE.test(definition)) {
    return ensureSqlTerminator(definition).slice(0, -1);
  }
  if (!trigger.functionName) {
    return "EXECUTE FUNCTION unknown_trigger_function()";
  }
  const functionName = trigger.functionName.includes("(")
    ? trigger.functionName
    : `${trigger.functionName}()`;
  return `EXECUTE FUNCTION ${functionName}`;
}

function formatTriggerSql({
  schemaName,
  tableName,
  trigger,
}: {
  schemaName: string;
  tableName: string;
  trigger: TableTrigger;
}) {
  if (CREATE_TRIGGER_RE.test(trigger.definition.trim())) {
    return ensureSqlTerminator(trigger.definition);
  }
  const events =
    trigger.events.length > 0 ? trigger.events.join(" OR ") : "UPDATE";
  const timing = trigger.timing || "AFTER";
  const tableLabel = formatTriggerTableName(schemaName, tableName);
  return ensureSqlTerminator(
    `CREATE TRIGGER ${formatTriggerSqlIdentifier(
      trigger.triggerName
    )} ${timing} ${events} ON ${tableLabel} FOR EACH ROW ${formatTriggerFunctionCall(
      trigger
    )}`
  );
}

function formatTriggerSqlForDisplay(sql: string) {
  return ensureSqlTerminator(sql).replace(
    TRIGGER_SQL_FOR_EACH_RE,
    "\n  FOR EACH "
  );
}

function triggerFunctionLabel(trigger: TableTrigger) {
  const match = trigger.definition.trim().match(EXECUTE_FUNCTION_RE);
  if (match?.[1]) {
    return `→ ${match[1].trim()}`;
  }
  if (!trigger.functionName) {
    return "→ unknown_trigger_function()";
  }
  const functionName = trigger.functionName.includes("(")
    ? trigger.functionName
    : `${trigger.functionName}()`;
  return `→ ${functionName}`;
}

function triggerEventsLabel(trigger: TableTrigger) {
  const events = trigger.events.filter(Boolean);
  return events.length > 0 ? events.join(" OR ") : "UPDATE";
}

function triggerLevelLabel(trigger: TableTrigger) {
  const match = trigger.definition.match(TRIGGER_SCOPE_RE);
  if (!match?.[1]) {
    return "ROW";
  }
  return match[1].toUpperCase();
}

function triggerWhenExpression(trigger: TableTrigger) {
  const match = trigger.definition.match(TRIGGER_WHEN_RE);
  return match?.[1]?.trim() ?? "";
}

function TriggerSqlCopyButton({
  sql,
  triggerName,
}: {
  sql: string;
  triggerName: string;
}) {
  const [copyState, setCopyState] = useState<"copied" | "error" | "idle">(
    "idle"
  );

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }
    const timeout = window.setTimeout(function resetTriggerSqlCopyState() {
      setCopyState("idle");
    }, TRIGGER_SQL_COPY_FEEDBACK_MS);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [copyState]);

  async function handleCopyTriggerSql() {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setCopyState("error");
      return;
    }
    try {
      await navigator.clipboard.writeText(sql);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  let buttonLabel = "Copy";
  if (copyState === "copied") {
    buttonLabel = "Copied";
  } else if (copyState === "error") {
    buttonLabel = "Copy failed";
  }
  let statusMessage = "";
  if (copyState === "copied") {
    statusMessage = `SQL for ${triggerName} copied.`;
  } else if (copyState === "error") {
    statusMessage = `Could not copy SQL for ${triggerName}.`;
  }

  return (
    <>
      <Button
        aria-label={`Copy SQL for ${triggerName}`}
        className="h-6 px-2 text-xs"
        onClick={handleCopyTriggerSql}
        size="xs"
        type="button"
        variant="ghost"
      >
        {buttonLabel}
      </Button>
      <span aria-live="polite" className="sr-only" role="status">
        {statusMessage}
      </span>
    </>
  );
}

function TriggerCard({
  schemaName,
  tableName,
  trigger,
}: {
  schemaName: string;
  tableName: string;
  trigger: TableTrigger;
}) {
  const sql = formatTriggerSql({ schemaName, tableName, trigger });
  const whenExpression = triggerWhenExpression(trigger);
  return (
    <div
      className="flex-none rounded-[10px] border bg-card px-[14px] py-[11px] shadow-xs"
      data-trigger-name={trigger.triggerName}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "size-[7px] flex-none rounded-full",
            trigger.enabled ? "bg-success" : "bg-muted-foreground"
          )}
        />
        <span className="sr-only">
          {trigger.enabled ? "Enabled trigger" : "Disabled trigger"}
        </span>
        <span className="font-mono font-semibold text-[12.5px]">
          {trigger.triggerName}
        </span>
        {trigger.timing ? (
          <Badge
            className="h-[18px] rounded-full px-2 text-[10px]"
            variant="secondary"
          >
            {trigger.timing}
          </Badge>
        ) : null}
        <Badge
          className="h-[18px] rounded-full px-2 font-mono text-[10px]"
          variant="outline"
        >
          {triggerEventsLabel(trigger)}
        </Badge>
        <Badge
          className="h-[18px] rounded-full px-2 text-[10px] text-muted-foreground"
          variant="ghost"
        >
          {triggerLevelLabel(trigger)}
        </Badge>
        {trigger.enabled ? null : (
          <span
            className={cn(
              "inline-flex h-[18px] items-center rounded-full px-2 font-medium text-[10px]",
              PILL_TONE_CLASSES.amber
            )}
          >
            disabled
          </span>
        )}
        <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground">
          {triggerFunctionLabel(trigger)}
        </span>
      </div>
      {whenExpression ? (
        <div className="mt-[7px] font-mono text-[11px] text-muted-foreground">
          WHEN ({whenExpression})
        </div>
      ) : null}
      <div className="mt-[9px] flex items-start gap-2 border-t pt-2">
        <pre className="m-0 min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.55]">
          <SqlSyntaxHighlight sql={formatTriggerSqlForDisplay(sql)} />
        </pre>
        <TriggerSqlCopyButton sql={sql} triggerName={trigger.triggerName} />
      </div>
    </div>
  );
}

function TriggersTab({
  query,
  schemaName,
  tableName,
}: {
  query: ReturnType<typeof useListTableTriggersQuery>;
  schemaName: string;
  tableName: string;
}) {
  const [search, setSearch] = useState("");
  const [stateFilters, setStateFilters] = useState<string[]>([]);
  const toolbar = deriveMetadataToolbar([query]);
  if (query.error) {
    return (
      <TabError
        errors={[
          {
            endpoint: "ListTableTriggers",
            error: query.error,
            label: "Triggers",
          },
        ]}
        onRetry={toolbar.handleRetry}
        tab="triggers"
      />
    );
  }
  if (!query.data || query.isLoading) {
    return <TabSkeleton />;
  }
  const triggers = query.data.triggers;
  if (triggers.length === 0) {
    return <TableResourceEmptyState category="triggers" toolbar={toolbar} />;
  }
  const filteredTriggers = filterTableTriggers(triggers, {
    search,
    states: stateFilters.filter(isTriggerStateFilter),
  });
  return (
    <div
      className="flex flex-col gap-3"
      data-table-key="data-explorer-table-triggers"
      data-testid="data-explorer-table-triggers"
    >
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <DataTableFilter
            onChange={setSearch}
            placeholder="Search triggers…"
            value={search}
          />
          <FacetFilterBar
            filters={[
              {
                handleSelectedValuesChange: setStateFilters,
                label: "State",
                options: presentTriggerStateOptions(triggers),
                selectedValues: stateFilters,
              },
            ]}
          />
        </div>
        <RefreshControl
          className="text-muted-foreground text-xs"
          isRefreshing={toolbar.isRefreshing}
          labelClassName="sm:not-sr-only"
          lastFetchedLabel={toolbar.lastFetchedLabel}
          onRefresh={toolbar.handleRefresh}
        />
      </div>
      {filteredTriggers.length === 0 ? (
        <SearchEmptyState
          className="rounded-[10px] border"
          resourceName="triggers"
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredTriggers.map((trigger) => (
            <TriggerCard
              key={trigger.triggerName}
              schemaName={schemaName}
              tableName={tableName}
              trigger={trigger}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Data-placeholder glyph used across metadata surfaces (see formatColumnList
// and formatBytes) for values the catalog does not report.
const EMPTY_DEPENDENCY_PLACEHOLDER = "—";

interface DefinitionSection {
  content: string;
  detail: string;
  id: string;
  kind: "code" | "note";
  title: string;
}

/** Always quotes identifiers used in copy-paste DDL. */
function formatSqlIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function formatQualifiedTableName(schemaName: string, tableName: string) {
  return `${formatSqlIdentifier(schemaName)}.${formatSqlIdentifier(tableName)}`;
}

function formatTableResourceName(tableResourceName: string) {
  const { schema, table } = parseTableQualifiedName(tableResourceName);
  return formatQualifiedTableName(schema, table);
}

function formatSqlStringLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function commentSql({
  columns,
  qualifiedTableName,
  tableComment,
}: {
  columns: TableColumn[];
  qualifiedTableName: string;
  tableComment: string;
}) {
  const statements: string[] = [];
  if (tableComment.trim()) {
    statements.push(
      `COMMENT ON TABLE ${qualifiedTableName} IS ${formatSqlStringLiteral(tableComment)};`
    );
  }
  for (const column of columns) {
    if (column.comment.trim()) {
      statements.push(
        `COMMENT ON COLUMN ${qualifiedTableName}.${formatSqlIdentifier(
          column.columnName
        )} IS ${formatSqlStringLiteral(column.comment)};`
      );
    }
  }
  return statements;
}

function formatIdentityGeneration(generation: IdentityGeneration) {
  return IDENTITY_GENERATION_LABELS[generation] || "BY DEFAULT";
}

function formatColumnDefinition(column: TableColumn) {
  const parts = [
    formatSqlIdentifier(column.columnName),
    column.rawType || "unknown",
  ];
  if (column.isIdentity) {
    parts.push(
      `GENERATED ${formatIdentityGeneration(column.identityGeneration)} AS IDENTITY`
    );
  }
  if (column.isGenerated && column.generationExpression) {
    parts.push(`GENERATED ALWAYS AS (${column.generationExpression}) STORED`);
  }
  if (!column.isNullable) {
    parts.push("NOT NULL");
  }
  if (column.defaultValue && !(column.isGenerated || column.isIdentity)) {
    parts.push(`DEFAULT ${column.defaultValue}`);
  }
  return parts.join(" ");
}

function createTableSql({
  columns,
  partitionMetadata,
  qualifiedTableName,
  tableType,
}: {
  columns: TableColumn[];
  partitionMetadata: TablePartitionMetadata | undefined;
  qualifiedTableName: string;
  tableType: Table_TableType;
}) {
  if (partitionMetadata?.parentTable && partitionMetadata.partitionBound) {
    return `CREATE TABLE ${qualifiedTableName} PARTITION OF ${formatTableResourceName(
      partitionMetadata.parentTable
    )}\n  ${partitionMetadata.partitionBound};`;
  }
  if (columns.length === 0) {
    return `CREATE TABLE ${qualifiedTableName} (\n  -- Column metadata unavailable\n);`;
  }
  const columnLines = columns
    .slice()
    .sort((left, right) => left.ordinalPosition - right.ordinalPosition)
    .map((column, index, sortedColumns) => {
      const suffix = index < sortedColumns.length - 1 ? "," : "";
      return `  ${formatColumnDefinition(column)}${suffix}`;
    })
    .join("\n");
  const createPrefix =
    tableType === Table_TableType.TEMPORARY
      ? "CREATE TEMPORARY TABLE"
      : "CREATE TABLE";
  const partitionClause = partitionMetadata?.partitionKey
    ? ` PARTITION BY ${partitionMetadata.partitionKey}`
    : "";
  return `${createPrefix} ${qualifiedTableName} (\n${columnLines}\n)${partitionClause};`;
}

function constraintSql(
  constraints: TableConstraint[],
  qualifiedTableName: string
) {
  return constraints
    .flatMap((constraint) => {
      if (!constraint.definition) {
        return [];
      }
      if (!constraint.constraintName) {
        return [
          `ALTER TABLE ${qualifiedTableName} ADD ${constraint.definition};`,
        ];
      }
      return [
        `ALTER TABLE ${qualifiedTableName} ADD CONSTRAINT ${formatSqlIdentifier(
          constraint.constraintName
        )} ${constraint.definition};`,
      ];
    })
    .join("\n");
}

function partitionSql({
  metadata,
  qualifiedTableName,
}: {
  metadata: TablePartitionMetadata | undefined;
  qualifiedTableName: string;
}) {
  const lines: string[] = [];
  if (!metadata) {
    return "";
  }
  for (const partition of metadata.childPartitions) {
    lines.push(
      `CREATE TABLE ${formatTableResourceName(
        partition.table
      )} PARTITION OF ${qualifiedTableName}`
    );
    lines.push(`  ${partition.partitionBound};`);
  }
  return lines.join("\n");
}

function triggerSql(triggers: TableTrigger[], qualifiedTableName: string) {
  return triggers
    .flatMap((trigger) => {
      if (!trigger.triggerName) {
        return [];
      }
      const definition = trigger.definition.trim();
      if (definition.toUpperCase().startsWith("CREATE TRIGGER")) {
        const createStatement = definition.endsWith(";")
          ? definition
          : `${definition};`;
        if (trigger.enabled) {
          return [createStatement];
        }
        return [
          `${createStatement}\nALTER TABLE ${qualifiedTableName} DISABLE TRIGGER ${formatSqlIdentifier(
            trigger.triggerName
          )};`,
        ];
      }
      // The backend returns pg_get_triggerdef output, so this branch only
      // sees unexpected data. A statement cannot be reconstructed faithfully
      // from the remaining metadata (row vs statement level is not exposed),
      // so surface that instead of guessing FOR EACH ROW.
      return [
        `-- Trigger ${formatSqlIdentifier(trigger.triggerName)}: full definition unavailable`,
      ];
    })
    .join("\n");
}

function deriveDefinitionSections({
  columns,
  constraints,
  indexes,
  partitionMetadata,
  policies,
  qualifiedTableName,
  tableComment,
  tableType,
  triggers,
}: {
  columns: TableColumn[];
  constraints: TableConstraint[];
  indexes: TableIndex[];
  partitionMetadata: TablePartitionMetadata | undefined;
  policies: TablePolicy[];
  qualifiedTableName: string;
  tableComment: string;
  tableType: Table_TableType;
  triggers: TableTrigger[];
}): DefinitionSection[] {
  const { backingConstraintNames } = deriveConstraintKeyRows(constraints);
  const isForeignTable = tableType === Table_TableType.EXTERNAL;
  const sections: DefinitionSection[] = [
    {
      content: isForeignTable
        ? "Exact foreign-table DDL is unavailable. Use the pg_dump command to preserve its server and options."
        : createTableSql({
            columns,
            partitionMetadata,
            qualifiedTableName,
            tableType,
          }),
      detail: isForeignTable
        ? "foreign server and options are not exposed"
        : `${qualifiedTableName} · ${columns.length.toLocaleString()} columns · reconstructed from pg_catalog`,
      id: "create-table",
      kind: isForeignTable ? "note" : "code",
      title: isForeignTable ? "Foreign table" : "Create table",
    },
  ];
  const constraintsText = constraintSql(constraints, qualifiedTableName);
  if (constraintsText) {
    sections.push({
      content: constraintsText,
      detail: `${constraints.length.toLocaleString()} from pg_constraint`,
      id: "constraints",
      kind: "code",
      title: "Constraints",
    });
  }
  const standaloneIndexCount = indexes.filter(
    (index) => !backingConstraintNames.has(index.indexName)
  ).length;
  if (standaloneIndexCount > 0) {
    sections.push({
      content:
        "Exact index definitions are unavailable. Use the pg_dump command to preserve expressions, operator classes, and ordering.",
      detail: `${standaloneIndexCount.toLocaleString()} indexes require pg_get_indexdef`,
      id: "indexes",
      kind: "note",
      title: "Indexes",
    });
  }
  const partitionText = partitionSql({
    metadata: partitionMetadata,
    qualifiedTableName,
  });
  if (partitionText) {
    sections.push({
      content: partitionText,
      detail: `${(derivePartitionTabCount(partitionMetadata) ?? 0).toLocaleString()} from pg_partitioned_table`,
      id: "partitions",
      kind: "code",
      title: "Partitions",
    });
  }
  const commentStatements = commentSql({
    columns,
    qualifiedTableName,
    tableComment,
  });
  if (commentStatements.length > 0) {
    sections.push({
      content: commentStatements.join("\n"),
      detail: `${commentStatements.length.toLocaleString()} from pg_description`,
      id: "comments",
      kind: "code",
      title: "Comments",
    });
  }
  if (policies.length > 0) {
    sections.push({
      content:
        "Policy definitions are available, but row-level security enablement and forced mode are not. Use the pg_dump command to reproduce policies safely.",
      detail: `${policies.length.toLocaleString()} policies require table-level RLS state`,
      id: "policies",
      kind: "note",
      title: "Policies",
    });
  }
  if (policies.length === 0) {
    sections.push({
      content:
        "No row-level policies are returned for this table. Visibility is governed by grants unless row-level security is enabled outside this metadata response.",
      detail: "no policies returned",
      id: "row-level-security",
      kind: "note",
      title: "Row-level security",
    });
  }
  const triggerText = triggerSql(triggers, qualifiedTableName);
  if (triggerText) {
    sections.push({
      content: triggerText,
      detail: `${triggers.length.toLocaleString()} from pg_trigger`,
      id: "triggers",
      kind: "code",
      title: "Triggers",
    });
  }
  return sections;
}

function DefinitionSectionCard({ section }: { section: DefinitionSection }) {
  return (
    <Card className="gap-0 py-0" size="sm">
      <CardHeader className="border-b bg-muted/40 py-3">
        <h2 className="flex items-center gap-2 font-medium text-sm">
          {section.title}
        </h2>
        <CardDescription className="font-mono text-xs">
          {section.detail}
        </CardDescription>
      </CardHeader>
      {section.kind === "code" ? (
        <SqlCodeBlock
          className="rounded-none rounded-b-xl border-0 bg-muted/30 p-4 pr-10 text-[12px]"
          sql={section.content}
        />
      ) : (
        <CardContent className="py-4 text-muted-foreground text-sm leading-relaxed">
          {section.content}
        </CardContent>
      )}
    </Card>
  );
}

function DefinitionSideCard({
  action,
  children,
  icon: Icon,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Card className="gap-0 py-0" size="sm">
      <CardHeader className="border-b bg-muted/40 py-3">
        <h2 className="flex items-center gap-2 font-medium text-sm">
          <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
          {title}
        </h2>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className="py-3">{children}</CardContent>
    </Card>
  );
}

function dependencyReferences(constraints: TableConstraint[]) {
  return constraints.flatMap((constraint) => {
    if (!constraint.referencedTable) {
      return [];
    }
    const target = formatReferencedTable(constraint.referencedTable);
    const sourceColumns = formatColumnList(constraint.columnNames);
    const targetColumns = formatColumnList(constraint.referencedColumnNames);
    return [
      `${sourceColumns} → ${target}${
        targetColumns === "—" ? "" : `(${targetColumns})`
      }`,
    ];
  });
}

function dumpCommand({
  databaseId,
  qualifiedTableName,
  tableName,
}: {
  databaseId: string;
  qualifiedTableName: string;
  tableName: string;
}) {
  return [
    'pg_dump -h "$POSTGRES_HOST" \\',
    `  -U "$POSTGRES_ROLE" -d "\${DATABASE_NAME:-${shellDoubleQuoteEscape(databaseId)}}" \\`,
    "  --schema-only --no-owner --no-privileges \\",
    `  --table=${shellSingleQuote(qualifiedTableName)} > ${shellSingleQuote(
      `${tableName}.sql`
    )}`,
  ].join("\n");
}

function DefinitionCommandStep({
  command,
  number,
  title,
}: {
  command: string;
  number: number;
  title: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center gap-2 border-b bg-muted/60 px-3 py-2">
        <span className="flex size-5 items-center justify-center rounded-full bg-muted-foreground/20 font-mono text-[10px]">
          {number}
        </span>
        <h3 className="font-medium text-xs">{title}</h3>
        <CopyIconButton
          ariaLabel={`Copy ${title.toLowerCase()} command`}
          className="ml-auto"
          value={command}
        />
      </div>
      <Textarea
        aria-label={`${title} command`}
        className="block w-full resize-none overflow-x-auto whitespace-pre border-0 bg-transparent p-3 font-mono text-[11px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        readOnly={true}
        rows={Math.max(command.split("\n").length, 2)}
        spellCheck={false}
        value={command}
        wrap="off"
      />
    </div>
  );
}

function ReproduceLocallyCard({
  command,
  databaseId,
  schemaName,
  tableName,
}: {
  command: string;
  databaseId: string;
  schemaName: string;
  tableName: string;
}) {
  const createDatabaseCommand = `createdb -h localhost "\${DATABASE_NAME:-${shellDoubleQuoteEscape(databaseId)}}"`;
  const restoreCommand = [
    `psql -h localhost -d "\${DATABASE_NAME:-${shellDoubleQuoteEscape(databaseId)}}" \\`,
    `  -f ${shellSingleQuote(`${tableName}.sql`)}`,
  ].join("\n");
  const allSteps = [
    "export POSTGRES_HOST='your-host'",
    "export POSTGRES_ROLE='your-role'",
    `export DATABASE_NAME=${shellSingleQuote(databaseId)}`,
    "",
    command,
    "",
    createDatabaseCommand,
    "",
    restoreCommand,
  ].join("\n");

  return (
    <DefinitionSideCard icon={Terminal} title="Reproduce locally">
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-center font-mono text-[11px]">
          <span className="rounded-md bg-background px-2 py-1 shadow-sm">
            {tableName}
          </span>
          <span className="px-2 py-1 text-muted-foreground">{schemaName}</span>
          <span className="px-2 py-1 text-muted-foreground">{databaseId}</span>
        </div>
        <div className="flex min-h-8 items-center rounded-lg border bg-background px-3 py-1.5 text-sm">
          <span>Template: pg_dump, schema only (SQL)</span>
        </div>
        <DefinitionCommandStep
          command={command}
          number={1}
          title="Dump schema only"
        />
        <DefinitionCommandStep
          command={createDatabaseCommand}
          number={2}
          title="Create a local database"
        />
        <DefinitionCommandStep
          command={restoreCommand}
          number={3}
          title="Restore"
        />
        <Alert className="px-3 py-2">
          <AlertDescription className="text-[11px] leading-relaxed">
            Related foreign key targets are not included with --table; dump the
            schema scope if you need them.
          </AlertDescription>
        </Alert>
        <CopyIconButton
          ariaLabel="Copy all steps"
          className="w-full"
          size="sm"
          value={allSteps}
          variant="outline"
        >
          Copy all steps
        </CopyIconButton>
      </div>
    </DefinitionSideCard>
  );
}

function shellSingleQuote(value: string) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

// For values interpolated inside a double-quoted shell word, where $, ", \
// and backticks keep their special meaning.
function shellDoubleQuoteEscape(value: string) {
  return value.replace(/([\\"$`])/g, "\\$1");
}

function DefinitionTab({
  columnsQuery,
  constraintsQuery,
  databaseId,
  indexesQuery,
  partitionMetadataQuery,
  policiesQuery,
  schemaName,
  tableComment,
  tableName,
  tableType,
  triggersQuery,
}: {
  columnsQuery: ReturnType<typeof useListTableColumnsQuery>;
  constraintsQuery: ReturnType<typeof useListTableConstraintsQuery>;
  databaseId: string;
  indexesQuery: ReturnType<typeof useListTableIndexesQuery>;
  partitionMetadataQuery: ReturnType<typeof useGetTablePartitionMetadataQuery>;
  policiesQuery: ReturnType<typeof useListTablePoliciesQuery>;
  schemaName: string;
  tableComment: string;
  tableName: string;
  tableType: Table_TableType;
  triggersQuery: ReturnType<typeof useListTableTriggersQuery>;
}) {
  useEffect(
    function refreshDefinitionOnOpen() {
      Promise.all([
        columnsQuery.refetch(),
        constraintsQuery.refetch(),
        indexesQuery.refetch(),
        partitionMetadataQuery.refetch(),
        policiesQuery.refetch(),
        triggersQuery.refetch(),
      ]);
    },
    [
      columnsQuery.refetch,
      constraintsQuery.refetch,
      indexesQuery.refetch,
      partitionMetadataQuery.refetch,
      policiesQuery.refetch,
      triggersQuery.refetch,
    ]
  );
  const toolbar = deriveMetadataToolbar([
    columnsQuery,
    constraintsQuery,
    indexesQuery,
    partitionMetadataQuery,
    policiesQuery,
    triggersQuery,
  ]);
  const errors = collectQueryErrors(
    {
      endpoint: "ListTableColumns",
      label: "Columns",
      query: columnsQuery,
    },
    {
      endpoint: "ListTableConstraints",
      label: "Constraints",
      query: constraintsQuery,
    },
    {
      endpoint: "ListTableIndexes",
      label: "Indexes",
      query: indexesQuery,
    },
    {
      endpoint: "GetTablePartitionMetadata",
      label: "Partitions",
      query: partitionMetadataQuery,
    },
    {
      endpoint: "ListTablePolicies",
      label: "Policies",
      query: policiesQuery,
    },
    {
      endpoint: "ListTableTriggers",
      label: "Triggers",
      query: triggersQuery,
    }
  );
  const blockingErrors = columnsQuery.data
    ? []
    : errors.filter((queryError) => queryError.label === "Columns");
  if (blockingErrors.length > 0) {
    return (
      <TabError
        errors={blockingErrors}
        onRetry={toolbar.handleRetry}
        tab="definition"
      />
    );
  }
  if (!columnsQuery.data || columnsQuery.isLoading) {
    return <TabSkeleton />;
  }

  const constraints = constraintsQuery.data?.constraints ?? [];
  const indexes = indexesQuery.data?.indexes ?? [];
  const policies = policiesQuery.data?.policies ?? [];
  const triggers = triggersQuery.data?.triggers ?? [];
  const qualifiedTableName = formatQualifiedTableName(schemaName, tableName);
  const sections = deriveDefinitionSections({
    columns: columnsQuery.data.columns,
    constraints,
    indexes,
    partitionMetadata: partitionMetadataQuery.data?.partitionMetadata,
    policies,
    qualifiedTableName,
    tableComment,
    tableType,
    triggers,
  });
  const references = dependencyReferences(constraints);
  const command = dumpCommand({
    databaseId,
    qualifiedTableName,
    tableName,
  });

  return (
    <div className="@container/definition">
      <div className="grid @5xl/definition:grid-cols-[minmax(0,1fr)_22rem] gap-4">
        <div className="min-w-0 space-y-4">
          {errors.length > 0 ? (
            <TabError
              errors={errors}
              onRetry={toolbar.handleRetry}
              tab="definition"
            />
          ) : null}
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 text-muted-foreground text-sm">
            <span>Schema document</span>
            <span aria-hidden="true">·</span>
            <span>
              generated live from{" "}
              <code className="rounded bg-muted px-1 py-0.5">pg_catalog</code>
            </span>
            <span aria-hidden="true">·</span>
            <span>{toolbar.lastFetchedLabel}</span>
            <div className="ml-auto shrink-0">
              <Button
                disabled={toolbar.isRefreshing}
                onClick={toolbar.handleRefresh}
                size="sm"
                type="button"
                variant="outline"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={cn(
                    "size-3.5",
                    toolbar.isRefreshing &&
                      "animate-spin motion-reduce:animate-none"
                  )}
                  data-icon="inline-start"
                />
                Refresh
              </Button>
            </div>
          </div>
          {sections.map((section) => (
            <DefinitionSectionCard key={section.id} section={section} />
          ))}
        </div>
        <aside className="space-y-4">
          <DefinitionSideCard icon={Layers} title="Dependencies">
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  References
                </p>
                {references.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {references.map((reference) => (
                      <li className="font-mono text-xs" key={reference}>
                        {reference}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 font-mono text-muted-foreground text-xs">
                    {EMPTY_DEPENDENCY_PLACEHOLDER}
                  </p>
                )}
              </div>
            </div>
          </DefinitionSideCard>
          <ReproduceLocallyCard
            command={command}
            databaseId={databaseId}
            schemaName={schemaName}
            tableName={tableName}
          />
          <p className="px-1 text-muted-foreground text-xs leading-relaxed">
            Definition is generated from pg_catalog on each visit; Querylane
            never stores or mutates schema.
          </p>
        </aside>
      </div>
    </div>
  );
}

function TableDetailTabTrigger({
  count,
  icon: Icon,
  label,
  value,
}: {
  count?: number | undefined;
  icon: LucideIcon;
  label: string;
  value: TableDetailTab;
}) {
  return (
    <TabsTrigger value={value}>
      <Icon aria-hidden="true" data-icon="inline-start" />
      <span>{label}</span>
      {count === undefined ? null : (
        <Badge
          className="h-5 min-w-5 rounded-full px-1.5 font-mono text-[10px]"
          variant="secondary"
        >
          {count.toLocaleString()}
        </Badge>
      )}
    </TabsTrigger>
  );
}
function TableDetail({
  databaseId,
  initialTab = "data",
  instanceId,
  onTabChange,
  schemaName,
  table,
  tableName,
}: {
  databaseId: string;
  initialTab?: string | undefined;
  instanceId: string;
  onTabChange?: ((tab: TableDetailTab) => void) | undefined;
  schemaName: string;
  table: TableProto | undefined;
  tableName: string;
}) {
  const resolvedInitialTab = isTableDetailTab(initialTab) ? initialTab : "data";

  function handleTabChange(next: string) {
    if (!isTableDetailTab(next)) {
      return;
    }
    onTabChange?.(next);
  }
  const tableResourceName = buildTableName(
    instanceId,
    databaseId,
    schemaName,
    tableName
  );

  // Fetch table metadata up front so tabs can show stable resource counts.
  // The same queries back the tab panels, so counts cannot drift from content.
  const tableResourceInput = { parent: tableResourceName };
  const columnsQuery = useListTableColumnsQuery(
    tableResourceInput,
    TABLE_METADATA_QUERY_OPTIONS
  );
  const constraintsQuery = useListTableConstraintsQuery(
    tableResourceInput,
    TABLE_METADATA_QUERY_OPTIONS
  );
  const indexesQuery = useListTableIndexesQuery(
    tableResourceInput,
    TABLE_METADATA_QUERY_OPTIONS
  );
  const policiesQuery = useListTablePoliciesQuery(
    tableResourceInput,
    TABLE_METADATA_QUERY_OPTIONS
  );
  const triggersQuery = useListTableTriggersQuery(
    tableResourceInput,
    TABLE_METADATA_QUERY_OPTIONS
  );
  const partitionMetadataQuery = useGetTablePartitionMetadataQuery(
    tableResourceName,
    TABLE_METADATA_QUERY_OPTIONS
  );
  const columnCount = columnsQuery.data?.columns.length;
  const keyRows =
    constraintsQuery.data && indexesQuery.data
      ? deriveTableKeyRows(
          constraintsQuery.data.constraints,
          indexesQuery.data.indexes
        )
      : undefined;
  const tabCounts: Record<TableDetailTab, number | undefined> = {
    columns: columnCount,
    constraints: constraintsQuery.data?.constraints.length,
    data: undefined,
    definition: undefined,
    indexes: indexesQuery.data?.indexes.length,
    keys: keyRows?.length,
    partitions: partitionMetadataQuery.data
      ? derivePartitionTabCount(partitionMetadataQuery.data.partitionMetadata)
      : undefined,
    policies: policiesQuery.data?.policies.length,
    triggers: triggersQuery.data?.triggers.length,
  };
  return (
    <TableDataGrid key={tableResourceName} name={tableResourceName}>
      {({ grid, lastFetchedLabel }) => (
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-4 pb-6">
          <TableDetailHeader
            columnCount={columnCount}
            lastFetchedLabel={lastFetchedLabel}
            schemaName={schemaName}
            table={table}
            tableName={tableName}
          />

          <Tabs
            className="min-h-0 w-full min-w-0 flex-1 flex-col"
            defaultValue={resolvedInitialTab}
            key={resolvedInitialTab}
            onValueChange={handleTabChange}
          >
            <div className="-mx-1 shrink-0 overflow-x-auto overflow-y-hidden px-1 pb-1">
              <TabsList className="h-9 min-w-max">
                {TABLE_DETAIL_TABS.map((tabDefinition) => (
                  <TableDetailTabTrigger
                    count={tabCounts[tabDefinition.value]}
                    icon={tabDefinition.icon}
                    key={tabDefinition.value}
                    label={tabDefinition.label}
                    value={tabDefinition.value}
                  />
                ))}
              </TabsList>
            </div>

            <TabsContent className="mt-4 min-h-0" value="data">
              {/*
                Key on the table identity so switching tables remounts the grid:
                a fresh query observer drops the previous table's placeholder rows
                and shows the loading skeleton, instead of lingering on stale data.
                Same-table paging/sort/filter keeps the observer, so placeholderData
                still holds the prior page while the next loads.
              */}
              {grid}
            </TabsContent>
            <TabsContent className="mt-4" value="columns">
              <ColumnsTab
                columnsQuery={columnsQuery}
                constraintsQuery={constraintsQuery}
                indexesQuery={indexesQuery}
              />
            </TabsContent>
            <TabsContent className="mt-4" value="keys">
              <KeysTab
                constraintsQuery={constraintsQuery}
                indexesQuery={indexesQuery}
                rows={keyRows}
              />
            </TabsContent>
            <TabsContent className="mt-4" value="partitions">
              <PartitionsTab query={partitionMetadataQuery} />
            </TabsContent>
            <TabsContent className="mt-4" value="indexes">
              <IndexesTab query={indexesQuery} />
            </TabsContent>
            <TabsContent className="mt-4" value="constraints">
              <ConstraintsTab
                databaseId={databaseId}
                instanceId={instanceId}
                query={constraintsQuery}
              />
            </TabsContent>
            <TabsContent className="mt-4" value="policies">
              <PoliciesTab query={policiesQuery} />
            </TabsContent>
            <TabsContent className="mt-4" value="triggers">
              <TriggersTab
                query={triggersQuery}
                schemaName={schemaName}
                tableName={tableName}
              />
            </TabsContent>
            <TabsContent className="mt-4" value="definition">
              <DefinitionTab
                columnsQuery={columnsQuery}
                constraintsQuery={constraintsQuery}
                databaseId={databaseId}
                indexesQuery={indexesQuery}
                partitionMetadataQuery={partitionMetadataQuery}
                policiesQuery={policiesQuery}
                schemaName={schemaName}
                tableComment={table?.comment ?? ""}
                tableName={tableName}
                tableType={table?.tableType ?? Table_TableType.UNSPECIFIED}
                triggersQuery={triggersQuery}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </TableDataGrid>
  );
}

export { TableDetail };
