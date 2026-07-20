import { useState } from "react";
import {
  DataTable,
  type DataTableColumnDef,
  DataTableFilter,
  SortableHeader,
} from "@/components/ui/data-table";
import { RefreshControl } from "@/components/ui/refresh-control";
import {
  type ColumnRow,
  deriveColumnRows,
} from "@/features/data-explorer/explorer-column-rows";
import {
  deriveMetadataToolbar,
  type MetadataToolbar,
} from "@/features/data-explorer/explorer-table-detail/metadata";
import {
  COLUMN_DEFAULT_FILTER_OPTIONS,
  COLUMN_GENERATION_FILTER_OPTIONS,
  COLUMN_KEY_FILTER_OPTIONS,
  COLUMN_NULLABILITY_FILTER_OPTIONS,
  IDENTITY_GENERATION_LABELS,
  presentColumnOptions,
  uniqueSortedOptions,
} from "@/features/data-explorer/explorer-table-detail/options";
import {
  FacetFilterBar,
  Pill,
  TabError,
  TableResourceEmptyState,
  TabSkeleton,
} from "@/features/data-explorer/explorer-table-detail/shared-ui";
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
} from "@/features/data-explorer/explorer-table-detail-filters";
import { describePostgresType } from "@/features/data-explorer/postgres-type-display";
import { collectQueryErrors } from "@/features/data-explorer/table-detail-query-state";
import type {
  useListTableColumnsQuery,
  useListTableConstraintsQuery,
  useListTableIndexesQuery,
} from "@/hooks/api/table";
import type { Column as TableColumn } from "@/protogen/querylane/console/v1alpha1/table_pb";

const UNAVAILABLE_COLUMN_STATISTIC_LABEL =
  "Not available from the current column metadata API";

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

function columnMatchesSearch(row: ColumnRow, needle: string) {
  return columnSearchText(row).includes(needle);
}

function filterColumnRowsBySearch(rows: ColumnRow[], searchValue: string) {
  const needle = searchValue.trim().toLocaleLowerCase();
  if (!needle) {
    return rows;
  }
  return rows.filter((row) => columnMatchesSearch(row, needle));
}

function ColumnBadges({ row }: { row: ColumnRow }) {
  const { column, fks, isIndexed } = row;
  const identityLabel = IDENTITY_GENERATION_LABELS[column.identityGeneration];
  const foreignKeyTitle = fks
    .map((fk) => `References ${fk.table}.${fk.column}`)
    .join("; ");
  const showIndexedBadge =
    isIndexed && !(column.isPrimaryKey || column.isUnique || fks.length > 0);
  return (
    <>
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
    </>
  );
}

function ColumnNameCell({ row }: { row: ColumnRow }) {
  const { column, fks } = row;
  const foreignKeyTitle = fks
    .map((fk) => `References ${fk.table}.${fk.column}`)
    .join("; ");
  return (
    <div className="min-w-[14rem]">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-mono font-semibold text-foreground text-xs">
          {column.columnName}
        </span>
        <ColumnBadges row={row} />
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
      const { defaultValue } = row.original.column;
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
        tableClassName="text-sm"
        tableKey="data-explorer-table-columns"
      />
    </div>
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

export { ColumnsTab };
