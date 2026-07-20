import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  type DataTableColumnDef,
  SortableHeader,
} from "@/components/ui/data-table";
import {
  TABLE_KEY_KIND_LABELS,
  type TableKeyKind,
  type TableKeyRow,
} from "@/features/data-explorer/explorer-table-detail/keys-model";
import { deriveMetadataToolbar } from "@/features/data-explorer/explorer-table-detail/metadata";
import { uniqueSortedOptions } from "@/features/data-explorer/explorer-table-detail/options";
import {
  FacetFilterBar,
  MetadataTabResult,
  TabError,
  TabSkeleton,
} from "@/features/data-explorer/explorer-table-detail/shared-ui";
import { collectQueryErrors } from "@/features/data-explorer/table-detail-query-state";
import type {
  useListTableConstraintsQuery,
  useListTableIndexesQuery,
} from "@/hooks/api/table";

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
  const kindFilterSet = new Set(kindFilters);
  const filteredRows =
    kindFilters.length === 0
      ? rows
      : rows.filter((row) => kindFilterSet.has(row.kind));
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

export { KeysTab };
