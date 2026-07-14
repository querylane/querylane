import {
  type ColumnDef,
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFns,
  rowPaginationFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from "@tanstack/react-table";
import { workerRowModelsFeature } from "@tanstack/react-table/experimental-worker-plugin";

interface BenchmarkRow {
  displayName: string;
  kind: "table" | "view";
  owner: string;
  rowCount: number;
  sizeBytes: number;
}

const benchmarkSharedFeatures = tableFeatures({
  columnFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns,
  paginatedRowModel: createPaginatedRowModel(),
  rowPaginationFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
  workerRowModelsFeature,
});

type BenchmarkFeatures = typeof benchmarkSharedFeatures;

const benchmarkColumns: ColumnDef<BenchmarkFeatures, BenchmarkRow, unknown>[] =
  [
    {
      accessorKey: "displayName",
      filterFn: "includesString",
      id: "name",
    },
    {
      accessorKey: "kind",
    },
    {
      accessorKey: "owner",
    },
    {
      accessorKey: "rowCount",
    },
    {
      accessorKey: "sizeBytes",
      id: "size",
    },
  ];

export type { BenchmarkFeatures, BenchmarkRow };
export { benchmarkColumns, benchmarkSharedFeatures };
