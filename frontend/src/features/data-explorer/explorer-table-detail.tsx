"use client";

import type { RowData } from "@tanstack/react-table";
import {
  Binary,
  Boxes,
  Columns3,
  FileCode2,
  GitBranch,
  GitCompareArrows,
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
  TriangleAlert,
  X,
} from "lucide-react";
import { useState } from "react";
import { AppInlineError } from "@/components/app-error-view";
import { TableDataGrid } from "@/components/data-grid/table-data-grid/table-data-grid";
import { EmptyStatePanel } from "@/components/empty-state-panel";
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
  SortableHeader,
} from "@/components/ui/data-table";
import {
  DataTableFacetedFilter,
  type FacetedFilterOption,
} from "@/components/ui/data-table-faceted-filter";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  type ColumnRow,
  deriveColumnRows,
} from "@/features/data-explorer/explorer-column-rows";
import { HeaderStat } from "@/features/data-explorer/explorer-shared-ui";
import {
  type ColumnKeyFilter,
  columnKeyKinds,
  columnTypeCategory,
  filterColumnDetailRows,
  filterConstraintsByKind,
  filterIndexesByMethod,
  filterPoliciesByMode,
  filterTriggersByState,
  type TriggerStateFilter,
} from "@/features/data-explorer/explorer-table-detail-filters";
import {
  type ChildPartitionFilters,
  derivePartitionTabCount,
  filterChildPartitions,
  formatPartitionResourceLabel,
  hasPartitionMetadata,
  type PartitionBoundKind,
  partitionBoundKind,
  partitionSchemaName,
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
  parseTableQualifiedName,
} from "@/lib/console-resources";
import { formatPolicyCommand, formatPolicyMode } from "@/lib/protobuf-enums";
import { QUERY_STALE_TIME } from "@/lib/query-policy";
import { normalizeAppUiError } from "@/lib/ui-error";
import { cn } from "@/lib/utils";
import type {
  Column as TableColumn,
  TableConstraint,
  TableIndex,
  TablePartition,
  TablePartitionMetadata,
  TablePolicy,
  Table as TableProto,
  TableTrigger,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  ConstraintType,
  IdentityGeneration,
  type PolicyMode,
  Table_TableType,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

const TABLE_METADATA_QUERY_OPTIONS = {
  staleTime: QUERY_STALE_TIME.static,
} as const;
const SKELETON_ROW_COUNT = 6;
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
const COLUMN_KEY_FILTER_LABELS: Record<ColumnKeyFilter, string> = {
  foreign: "Foreign key",
  indexed: "Indexed",
  none: "No key",
  primary: "Primary key",
};
const TRIGGER_STATE_FILTER_LABELS: Record<TriggerStateFilter, string> = {
  disabled: "Disabled",
  enabled: "Enabled",
};
const PARTITION_BOUND_KIND_LABELS: Record<PartitionBoundKind, string> = {
  default: "Default",
  hash: "Hash",
  list: "List",
  other: "Other",
  range: "Range",
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
function presentColumnKeyOptions(rows: ColumnRow[]): FacetedFilterOption[] {
  const present = new Set(rows.flatMap(columnKeyKinds));
  const options: FacetedFilterOption[] = [];
  for (const value of [
    "primary",
    "foreign",
    "indexed",
    "none",
  ] satisfies ColumnKeyFilter[]) {
    if (present.has(value)) {
      options.push({ label: COLUMN_KEY_FILTER_LABELS[value], value });
    }
  }
  return options;
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
function presentPartitionBoundKindOptions(
  partitions: TablePartition[]
): FacetedFilterOption[] {
  const present = new Set(partitions.map(partitionBoundKind));
  const options: FacetedFilterOption[] = [];
  for (const value of PARTITION_BOUND_KIND_ORDER) {
    if (present.has(value)) {
      options.push({ label: PARTITION_BOUND_KIND_LABELS[value], value });
    }
  }
  return options;
}
function isPartitionBoundKind(value: string): value is PartitionBoundKind {
  switch (value) {
    case "default":
    case "hash":
    case "list":
    case "other":
    case "range":
      return true;
    default:
      return false;
  }
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

function ColumnTypeCell({ column }: { column: TableColumn }) {
  const typeMeta = describePostgresType(column);
  return (
    <div
      className="min-w-[14rem] max-w-[24rem]"
      title={`${typeMeta.category}. ${typeMeta.summary}`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="font-mono text-foreground text-xs">
          {typeMeta.displayType}
        </span>
        <Badge className="h-4 px-1.5 text-[10px]" variant="outline">
          {typeMeta.category}
        </Badge>
      </div>
      {typeMeta.badges.length > 0 ? (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {typeMeta.badges.map((badge) => (
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
      <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
        {typeMeta.summary}
      </p>
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
const columnTabColumns: DataTableColumnDef<ColumnRow>[] = [
  {
    accessorFn: (row) => row.column.columnName,
    cell: ({ row }) => {
      const { column, fks } = row.original;
      return (
        <span className="inline-flex items-center gap-1.5">
          {column.isPrimaryKey ? (
            <Pill size="sm" tone="amber">
              PK
            </Pill>
          ) : null}
          {fks.length > 0 ? (
            <Pill size="sm" tone="blue">
              FK
            </Pill>
          ) : null}
          {column.columnName}
        </span>
      );
    },
    header: ({ column }) => (
      <SortableHeader column={column}>Name</SortableHeader>
    ),
    id: "columnName",
    meta: {
      cellClassName: "font-mono text-xs",
      headerClassName: "pl-3",
    },
  },
  {
    accessorFn: (row) => row.column.rawType,
    cell: ({ row }) => <ColumnTypeCell column={row.original.column} />,
    header: ({ column }) => (
      <SortableHeader column={column}>Type</SortableHeader>
    ),
    id: "type",
    meta: {
      cellClassName: "align-top",
    },
  },
  {
    accessorFn: (row) => row.column.defaultValue,
    cell: ({ row }) => row.original.column.defaultValue || "—",
    header: "Default",
    id: "default",
    meta: {
      cellClassName: "font-mono text-muted-foreground text-xs",
    },
  },
  {
    cell: ({ row }) => {
      const { column, fks, isIndexed } = row.original;
      const identityLabel =
        IDENTITY_GENERATION_LABELS[column.identityGeneration];
      return (
        <div className="flex flex-wrap items-center gap-1">
          {column.isNullable || column.isPrimaryKey ? null : (
            <Pill tone="slate">NOT NULL</Pill>
          )}
          {fks.map((fk) => (
            <Pill key={`${fk.table}.${fk.column}`} mono={true} tone="blue">
              →{fk.table}.{fk.column}
            </Pill>
          ))}
          {isIndexed && !column.isPrimaryKey ? (
            <Pill tone="violet">INDEXED</Pill>
          ) : null}
          {column.isGenerated ? <Pill tone="emerald">GENERATED</Pill> : null}
          {column.generationExpression ? (
            <Pill mono={true} title={column.generationExpression} tone="slate">
              <span className="block max-w-[18rem] truncate">
                AS {column.generationExpression}
              </span>
            </Pill>
          ) : null}
          {column.isIdentity ? <Pill tone="amber">IDENTITY</Pill> : null}
          {identityLabel ? <Pill tone="amber">{identityLabel}</Pill> : null}
        </div>
      );
    },
    enableSorting: false,
    header: "Properties",
    id: "properties",
  },
];
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
    keyKinds: keyKinds as ColumnKeyFilter[],
    typeCategories,
  });
  return (
    <MetadataTabResult
      category="columns"
      columns={columnTabColumns}
      data={filteredRows}
      filterColumn="columnName"
      filterPlaceholder="Search columns…"
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
              options: presentColumnKeyOptions(rows),
              selectedValues: keyKinds,
            },
          ]}
        />
      }
      hasUnfilteredData={rows.length > 0}
      pageSize={25}
      tableKey="data-explorer-table-columns"
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

const partitionColumns: DataTableColumnDef<TablePartition>[] = [
  {
    accessorFn: (row) =>
      `${formatPartitionResourceLabel(row.table)} ${row.partitionBound}`,
    cell: ({ row }) => formatPartitionResourceLabel(row.original.table),
    header: ({ column }) => (
      <SortableHeader column={column}>Partition</SortableHeader>
    ),
    id: "table",
    meta: {
      cellClassName: "font-mono text-xs",
      headerClassName: "pl-3",
    },
  },
  {
    accessorKey: "partitionBound",
    cell: ({ row }) => row.original.partitionBound || "—",
    header: "Bound",
    id: "partitionBound",
    meta: {
      cellClassName: "font-mono text-muted-foreground text-xs",
    },
  },
];

function PartitionsTab({
  query,
}: {
  query: ReturnType<typeof useGetTablePartitionMetadataQuery>;
}) {
  const toolbar = deriveMetadataToolbar([query]);
  const [partitionFilters, setPartitionFilters] =
    useState<ChildPartitionFilters>({});

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
  const childPartitions = metadata.childPartitions;
  const filteredChildPartitions = filterChildPartitions(
    childPartitions,
    partitionFilters
  );
  function renderPartitionToolbarFilters() {
    return (
      <FacetFilterBar
        filters={[
          {
            handleSelectedValuesChange: (schemaNames) => {
              setPartitionFilters((current) => ({
                ...current,
                schemaNames,
              }));
            },
            label: "Schema",
            options: uniqueSortedOptions(
              childPartitions.map(partitionSchemaName)
            ),
            selectedValues: partitionFilters.schemaNames ?? [],
          },
          {
            handleSelectedValuesChange: (values) => {
              setPartitionFilters((current) => ({
                ...current,
                boundKinds: values.filter(isPartitionBoundKind),
              }));
            },
            label: "Bound kind",
            options: presentPartitionBoundKindOptions(childPartitions),
            selectedValues: partitionFilters.boundKinds ?? [],
          },
        ]}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm">
          PostgreSQL partition hierarchy for this table.
        </span>
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
                toolbar.isRefreshing &&
                  "animate-spin motion-reduce:animate-none"
              )}
            />
            Refresh
          </Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summaryItems.map((item) => (
          <div className="rounded-lg border bg-card/60 p-3" key={item.label}>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
              {item.label}
            </p>
            <p className="mt-1 break-words font-mono text-foreground text-xs">
              {item.value}
            </p>
          </div>
        ))}
      </div>
      {childPartitions.length > 0 ? (
        <DataTable
          columns={partitionColumns}
          data={filteredChildPartitions}
          emptyResourceName="partitions"
          filterColumn="table"
          filterPlaceholder="Search partitions…"
          isRefreshing={toolbar.isRefreshing}
          lastFetchedLabel={toolbar.lastFetchedLabel}
          onRefresh={toolbar.handleRefresh}
          renderToolbarFilters={renderPartitionToolbarFilters}
          tableKey="data-explorer-table-partitions"
        />
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
const constraintColumns: DataTableColumnDef<TableConstraint>[] = [
  {
    accessorKey: "constraintName",
    cell: ({ row }) => row.original.constraintName,
    header: ({ column }) => (
      <SortableHeader column={column}>Name</SortableHeader>
    ),
    meta: {
      cellClassName: "font-mono text-xs",
      headerClassName: "pl-3",
    },
  },
  {
    accessorFn: (row) => CONSTRAINT_TYPE_LABELS[row.type],
    cell: ({ row }) => (
      <Badge className="font-mono text-[10px]" variant="outline">
        {CONSTRAINT_TYPE_LABELS[row.original.type]}
      </Badge>
    ),
    header: ({ column }) => (
      <SortableHeader column={column}>Kind</SortableHeader>
    ),
    id: "type",
  },
  {
    accessorKey: "definition",
    cell: ({ row }) => row.original.definition,
    header: "Definition",
    meta: {
      cellClassName: "font-mono text-muted-foreground text-xs",
    },
  },
];
function ConstraintsTab({
  query,
}: {
  query: ReturnType<typeof useListTableConstraintsQuery>;
}) {
  const [kindFilters, setKindFilters] = useState<string[]>([]);
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
  const filteredConstraints = filterConstraintsByKind(
    constraints,
    kindFilters.map(Number) as ConstraintType[]
  );
  return (
    <MetadataTabResult
      category="constraints"
      columns={constraintColumns}
      data={filteredConstraints}
      filterColumn="constraintName"
      filterPlaceholder="Search constraints…"
      filters={
        <FacetFilterBar
          filters={[
            {
              handleSelectedValuesChange: setKindFilters,
              label: "Kind",
              options: presentConstraintKindOptions(constraints),
              selectedValues: kindFilters,
            },
          ]}
        />
      }
      hasUnfilteredData={constraints.length > 0}
      tableKey="data-explorer-table-constraints"
      toolbar={toolbar}
    />
  );
}
const policyColumns: DataTableColumnDef<TablePolicy>[] = [
  {
    accessorKey: "policyName",
    cell: ({ row }) => row.original.policyName,
    header: ({ column }) => (
      <SortableHeader column={column}>Name</SortableHeader>
    ),
    meta: {
      cellClassName: "font-mono text-xs",
      headerClassName: "pl-3",
    },
  },
  {
    accessorFn: (row) => formatPolicyMode(row.mode),
    cell: ({ row }) => (
      <Badge className="font-mono text-[10px]" variant="outline">
        {formatPolicyMode(row.original.mode)}
      </Badge>
    ),
    header: ({ column }) => (
      <SortableHeader column={column}>Mode</SortableHeader>
    ),
    id: "mode",
  },
  {
    accessorFn: (row) => formatPolicyCommand(row.command),
    cell: ({ row }) => formatPolicyCommand(row.original.command),
    header: ({ column }) => (
      <SortableHeader column={column}>Command</SortableHeader>
    ),
    id: "command",
    meta: {
      cellClassName: "font-mono text-muted-foreground text-xs",
    },
  },
  {
    accessorFn: (row) => row.roles.join(", "),
    cell: ({ row }) =>
      row.original.roles.length > 0 ? row.original.roles.join(", ") : "—",
    header: "Roles",
    id: "roles",
    meta: {
      cellClassName: "font-mono text-muted-foreground text-xs",
    },
  },
  {
    accessorKey: "usingExpression",
    cell: ({ row }) => row.original.usingExpression || "—",
    header: "Using",
    id: "usingExpression",
    meta: {
      cellClassName: "font-mono text-muted-foreground text-xs",
    },
  },
  {
    accessorKey: "checkExpression",
    cell: ({ row }) => row.original.checkExpression || "—",
    header: "Check",
    id: "checkExpression",
    meta: {
      cellClassName: "font-mono text-muted-foreground text-xs",
    },
  },
];
function PoliciesTab({
  query,
}: {
  query: ReturnType<typeof useListTablePoliciesQuery>;
}) {
  const [modeFilters, setModeFilters] = useState<string[]>([]);
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
  const filteredPolicies = filterPoliciesByMode(
    policies,
    modeFilters.map(Number) as PolicyMode[]
  );
  return (
    <MetadataTabResult
      category="policies"
      columns={policyColumns}
      data={filteredPolicies}
      filterColumn="policyName"
      filterPlaceholder="Search policies…"
      filters={
        <FacetFilterBar
          filters={[
            {
              handleSelectedValuesChange: setModeFilters,
              label: "Mode",
              options: presentPolicyModeOptions(policies),
              selectedValues: modeFilters,
            },
          ]}
        />
      }
      hasUnfilteredData={policies.length > 0}
      tableKey="data-explorer-table-policies"
      toolbar={toolbar}
    />
  );
}
const triggerColumns: DataTableColumnDef<TableTrigger>[] = [
  {
    accessorKey: "triggerName",
    cell: ({ row }) => row.original.triggerName,
    header: ({ column }) => (
      <SortableHeader column={column}>Name</SortableHeader>
    ),
    meta: {
      cellClassName: "font-mono text-xs",
      headerClassName: "pl-3",
    },
  },
  {
    accessorFn: (row) => `${row.timing} · ${row.events.join(", ")}`,
    cell: ({ row }) =>
      `${row.original.timing} · ${row.original.events.join(", ")}`,
    header: "When",
    id: "when",
    meta: {
      cellClassName: "font-mono text-muted-foreground text-xs",
    },
  },
  {
    accessorKey: "functionName",
    cell: ({ row }) => row.original.functionName,
    header: "Function",
    id: "functionName",
    meta: {
      cellClassName: "font-mono text-muted-foreground text-xs",
    },
  },
  {
    accessorKey: "enabled",
    cell: ({ row }) =>
      row.original.enabled ? (
        <span className="text-emerald-600 dark:text-emerald-400">enabled</span>
      ) : (
        <span className="text-muted-foreground">disabled</span>
      ),
    header: ({ column }) => (
      <SortableHeader column={column}>State</SortableHeader>
    ),
    id: "state",
    meta: {
      cellClassName: "font-mono text-xs",
    },
  },
];
function TriggersTab({
  query,
}: {
  query: ReturnType<typeof useListTableTriggersQuery>;
}) {
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
  const filteredTriggers = filterTriggersByState(
    triggers,
    stateFilters as TriggerStateFilter[]
  );
  return (
    <MetadataTabResult
      category="triggers"
      columns={triggerColumns}
      data={filteredTriggers}
      filterColumn="triggerName"
      filterPlaceholder="Search triggers…"
      filters={
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
      }
      hasUnfilteredData={triggers.length > 0}
      tableKey="data-explorer-table-triggers"
      toolbar={toolbar}
    />
  );
}

const SIMPLE_SQL_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;
// PostgreSQL reserved key words plus type/function-name keywords. These match
// the simple identifier pattern but a bare `user` or `order` column would make
// the generated DDL unexecutable; quoting is valid in every position, so the
// list errs on the side of quoting.
const RESERVED_SQL_KEYWORDS = new Set([
  "all",
  "analyse",
  "analyze",
  "and",
  "any",
  "array",
  "as",
  "asc",
  "asymmetric",
  "authorization",
  "between",
  "bigint",
  "binary",
  "bit",
  "boolean",
  "both",
  "case",
  "cast",
  "char",
  "character",
  "check",
  "coalesce",
  "collate",
  "collation",
  "column",
  "concurrently",
  "constraint",
  "create",
  "cross",
  "current_catalog",
  "current_date",
  "current_role",
  "current_schema",
  "current_time",
  "current_timestamp",
  "current_user",
  "dec",
  "decimal",
  "default",
  "deferrable",
  "desc",
  "distinct",
  "do",
  "else",
  "end",
  "except",
  "exists",
  "extract",
  "false",
  "fetch",
  "float",
  "for",
  "foreign",
  "freeze",
  "from",
  "full",
  "grant",
  "greatest",
  "group",
  "grouping",
  "having",
  "ilike",
  "in",
  "initially",
  "inner",
  "inout",
  "int",
  "integer",
  "intersect",
  "interval",
  "into",
  "is",
  "isnull",
  "join",
  "lateral",
  "leading",
  "least",
  "left",
  "like",
  "limit",
  "localtime",
  "localtimestamp",
  "national",
  "natural",
  "nchar",
  "none",
  "normalize",
  "not",
  "notnull",
  "null",
  "nullif",
  "numeric",
  "offset",
  "on",
  "only",
  "or",
  "order",
  "out",
  "outer",
  "overlaps",
  "overlay",
  "placing",
  "position",
  "precision",
  "primary",
  "real",
  "references",
  "returning",
  "right",
  "row",
  "select",
  "session_user",
  "setof",
  "similar",
  "smallint",
  "some",
  "substring",
  "symmetric",
  "system_user",
  "table",
  "tablesample",
  "then",
  "time",
  "timestamp",
  "to",
  "trailing",
  "treat",
  "trim",
  "true",
  "union",
  "unique",
  "user",
  "using",
  "values",
  "varchar",
  "variadic",
  "verbose",
  "when",
  "where",
  "window",
  "with",
  "xmlattributes",
  "xmlconcat",
  "xmlelement",
  "xmlexists",
  "xmlforest",
  "xmlnamespaces",
  "xmlparse",
  "xmlpi",
  "xmlroot",
  "xmlserialize",
  "xmltable",
]);

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

function formatSqlIdentifier(identifier: string) {
  if (
    SIMPLE_SQL_IDENTIFIER_PATTERN.test(identifier) &&
    !RESERVED_SQL_KEYWORDS.has(identifier)
  ) {
    return identifier;
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

function formatQualifiedTableName(schemaName: string, tableName: string) {
  return `${formatSqlIdentifier(schemaName)}.${formatSqlIdentifier(tableName)}`;
}

function formatSqlStringLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
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
  qualifiedTableName,
}: {
  columns: TableColumn[];
  qualifiedTableName: string;
}) {
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
  return `CREATE TABLE ${qualifiedTableName} (\n${columnLines}\n);`;
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

function indexSql({
  backingConstraintNames,
  indexes,
  qualifiedTableName,
}: {
  backingConstraintNames: Set<string>;
  indexes: TableIndex[];
  qualifiedTableName: string;
}) {
  return indexes
    .flatMap((index) => {
      if (!index.indexName || backingConstraintNames.has(index.indexName)) {
        return [];
      }
      const unique = index.isUnique ? "UNIQUE " : "";
      const method = index.method || "btree";
      const keyColumns =
        index.keyColumns.length > 0
          ? index.keyColumns.map(formatSqlIdentifier).join(", ")
          : "/* expression */";
      const included =
        index.includedColumns.length > 0
          ? ` INCLUDE (${index.includedColumns
              .map(formatSqlIdentifier)
              .join(", ")})`
          : "";
      const predicate = index.predicate ? ` WHERE ${index.predicate}` : "";
      return [
        `CREATE ${unique}INDEX ${formatSqlIdentifier(
          index.indexName
        )} ON ${qualifiedTableName} USING ${method} (${keyColumns})${included}${predicate};`,
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
  if (metadata.partitionKey) {
    lines.push(`-- PARTITION BY ${metadata.partitionKey}`);
  }
  if (metadata.parentTable && metadata.partitionBound) {
    lines.push(
      `-- ${qualifiedTableName} is a partition of ${formatReferencedTable(
        metadata.parentTable
      )}`
    );
    lines.push(`-- ${metadata.partitionBound}`);
  }
  for (const partition of metadata.childPartitions) {
    lines.push(
      `CREATE TABLE ${formatReferencedTable(
        partition.table
      )} PARTITION OF ${qualifiedTableName}`
    );
    lines.push(`  ${partition.partitionBound};`);
  }
  return lines.join("\n");
}

function policySql(policies: TablePolicy[], qualifiedTableName: string) {
  return policies
    .flatMap((policy) => {
      if (!policy.policyName) {
        return [];
      }
      const roles =
        policy.roles.length > 0
          ? policy.roles.map(formatSqlIdentifier).join(", ")
          : "PUBLIC";
      const usingExpression = policy.usingExpression
        ? `\n  USING (${policy.usingExpression})`
        : "";
      const checkExpression = policy.checkExpression
        ? `\n  WITH CHECK (${policy.checkExpression})`
        : "";
      return [
        `CREATE POLICY ${formatSqlIdentifier(
          policy.policyName
        )} ON ${qualifiedTableName}\n  AS ${formatPolicyMode(
          policy.mode
        ).toUpperCase()}\n  FOR ${formatPolicyCommand(
          policy.command
        )} TO ${roles}${usingExpression}${checkExpression};`,
      ];
    })
    .join("\n");
}

function triggerSql(triggers: TableTrigger[]) {
  return triggers
    .flatMap((trigger) => {
      if (!trigger.triggerName) {
        return [];
      }
      const definition = trigger.definition.trim();
      if (definition.toUpperCase().startsWith("CREATE TRIGGER")) {
        return [definition.endsWith(";") ? definition : `${definition};`];
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
  triggers,
}: {
  columns: TableColumn[];
  constraints: TableConstraint[];
  indexes: TableIndex[];
  partitionMetadata: TablePartitionMetadata | undefined;
  policies: TablePolicy[];
  qualifiedTableName: string;
  tableComment: string;
  triggers: TableTrigger[];
}): DefinitionSection[] {
  const { backingConstraintNames } = deriveConstraintKeyRows(constraints);
  const sections: DefinitionSection[] = [
    {
      content: createTableSql({ columns, qualifiedTableName }),
      detail: `${qualifiedTableName} · ${columns.length.toLocaleString()} columns · reconstructed from pg_catalog`,
      id: "create-table",
      kind: "code",
      title: "Create table",
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
  const indexesText = indexSql({
    backingConstraintNames,
    indexes,
    qualifiedTableName,
  });
  if (indexesText) {
    sections.push({
      content: indexesText,
      detail: `${indexes.length.toLocaleString()} from pg_index`,
      id: "indexes",
      kind: "code",
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
  const trimmedComment = tableComment.trim();
  if (trimmedComment) {
    sections.push({
      content: `COMMENT ON TABLE ${qualifiedTableName} IS ${formatSqlStringLiteral(trimmedComment)};`,
      detail: "from pg_description",
      id: "comments",
      kind: "code",
      title: "Comments",
    });
  }
  const policyText = policySql(policies, qualifiedTableName);
  if (policyText) {
    sections.push({
      content: policyText,
      detail: `${policies.length.toLocaleString()} from pg_policies`,
      id: "policies",
      kind: "code",
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
  const triggerText = triggerSql(triggers);
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

function SchemaCodeBlock({ sql }: { sql: string }) {
  return (
    <div className="relative">
      <Textarea
        aria-label="SQL definition"
        className="block w-full resize-none overflow-x-auto whitespace-pre rounded-b-xl border-0 bg-muted/30 p-4 pr-10 font-mono text-[12px] text-foreground leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        readOnly={true}
        rows={Math.max(sql.split("\n").length, 2)}
        spellCheck={false}
        value={sql}
        wrap="off"
      />
      <CopyIconButton
        ariaLabel="Copy SQL"
        className="absolute top-3 right-3"
        value={sql}
      />
    </div>
  );
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
        <SchemaCodeBlock sql={section.content} />
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
        className="block w-full resize-none overflow-x-auto whitespace-pre-wrap border-0 bg-transparent p-3 font-mono text-[11px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
    "export POSTGRES_HOST=<host>",
    "export POSTGRES_ROLE=<role>",
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
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-700 leading-relaxed dark:text-amber-300">
          Related foreign key targets are not included with --table; dump the
          schema scope if you need them.
        </p>
        <CopyIconButton
          ariaLabel="Copy all reproduce steps"
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
  tableOwner,
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
  tableOwner: string;
  triggersQuery: ReturnType<typeof useListTableTriggersQuery>;
}) {
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
  if (errors.length > 0) {
    return (
      <TabError
        errors={errors}
        onRetry={toolbar.handleRetry}
        tab="definition"
      />
    );
  }
  if (
    !(
      columnsQuery.data &&
      constraintsQuery.data &&
      indexesQuery.data &&
      partitionMetadataQuery.data &&
      policiesQuery.data &&
      triggersQuery.data
    ) ||
    columnsQuery.isLoading ||
    constraintsQuery.isLoading ||
    indexesQuery.isLoading ||
    partitionMetadataQuery.isLoading ||
    policiesQuery.isLoading ||
    triggersQuery.isLoading
  ) {
    return <TabSkeleton />;
  }

  const qualifiedTableName = formatQualifiedTableName(schemaName, tableName);
  const sections = deriveDefinitionSections({
    columns: columnsQuery.data.columns,
    constraints: constraintsQuery.data.constraints,
    indexes: indexesQuery.data.indexes,
    partitionMetadata: partitionMetadataQuery.data.partitionMetadata,
    policies: policiesQuery.data.policies,
    qualifiedTableName,
    tableComment,
    triggers: triggersQuery.data.triggers,
  });
  const references = dependencyReferences(constraintsQuery.data.constraints);
  const command = dumpCommand({
    databaseId,
    qualifiedTableName,
    tableName,
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <span>Schema document</span>
          <span aria-hidden="true">·</span>
          <span>
            generated live from{" "}
            <code className="rounded bg-muted px-1 py-0.5">pg_catalog</code>
          </span>
          <div className="ml-auto">
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
        <DefinitionSideCard
          action={<Badge variant="secondary">Not configured</Badge>}
          icon={GitCompareArrows}
          title="Drift detection"
        >
          <p className="text-muted-foreground text-sm leading-relaxed">
            Compare environments when drift data is connected.
          </p>
        </DefinitionSideCard>
        <DefinitionSideCard icon={Layers} title="Dependencies">
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Referenced by
              </p>
              <p className="mt-1 font-mono text-muted-foreground text-xs">
                {EMPTY_DEPENDENCY_PLACEHOLDER}
              </p>
            </div>
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
          Definition is generated from pg_catalog on each visit; Querylane never
          stores or mutates schema.
        </p>
        <Card className="gap-0 border-destructive/40 py-0" size="sm">
          <CardHeader className="border-b bg-destructive/5 py-3">
            <h2 className="flex items-center gap-2 font-medium text-sm">
              <TriangleAlert
                aria-hidden="true"
                className="size-4 text-destructive"
              />
              Danger zone
            </h2>
            <CardAction>
              <Badge variant="outline">
                {tableOwner ? `requires ${tableOwner}` : "requires table owner"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex items-start gap-3 py-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">Truncate {qualifiedTableName}</p>
              <p className="mt-1 text-muted-foreground text-sm">
                Removes every row instantly and resets owned sequences.
              </p>
            </div>
            <Button
              disabled={true}
              size="sm"
              type="button"
              variant="destructive"
            >
              Truncate…
            </Button>
          </CardContent>
        </Card>
      </aside>
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
              <ConstraintsTab query={constraintsQuery} />
            </TabsContent>
            <TabsContent className="mt-4" value="policies">
              <PoliciesTab query={policiesQuery} />
            </TabsContent>
            <TabsContent className="mt-4" value="triggers">
              <TriggersTab query={triggersQuery} />
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
                tableOwner={table?.owner ?? ""}
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
