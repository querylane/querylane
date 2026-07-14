import {
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
  useTable,
} from "@tanstack/react-table";
import {
  createTableWorker,
  createWorkerRowModel,
} from "@tanstack/react-table/experimental-worker-plugin";
import { useEffect } from "react";
import {
  type BenchmarkFeatures,
  type BenchmarkRow,
  benchmarkColumns,
  benchmarkSharedFeatures,
} from "@/features/data-explorer/data-table-worker-benchmark-config";

const BENCHMARK_FILTER = "needle";
const BENCHMARK_PAGE_SIZE = 10;

type BenchmarkMode = "sync" | "worker";
type BenchmarkOperation = "filter" | "sort";

interface BenchmarkMetric {
  elapsedMs: number;
  filteredRowCount: number;
  firstRow: string;
  maxFrameGapMs: number;
  operation: BenchmarkOperation;
  workerComputeMs?: number;
  workerRoundTripMs?: number;
}

interface BenchmarkTableState {
  columnFilters: ColumnFiltersState;
  pagination: PaginationState;
  sorting: SortingState;
  workerRowModels: {
    isPending: boolean;
    lastComputeMs?: number;
    lastRoundTripMs?: number;
    version: number;
  };
}

interface UseDataTableWorkerBenchmarkArgs {
  data: BenchmarkRow[];
  mode: BenchmarkMode;
  tableKey: string;
}

const tableWorker = createTableWorker({
  createWorker: () =>
    new Worker(
      new URL("./data-table-worker-benchmark.worker.ts", import.meta.url),
      { type: "module" }
    ),
});

const workerFeatures: BenchmarkFeatures = {
  ...benchmarkSharedFeatures,
  filteredRowModel: createWorkerRowModel(tableWorker, "filtered"),
  sortedRowModel: createWorkerRowModel(tableWorker, "sorted"),
};

function useDataTableWorkerBenchmark({
  data,
  mode,
  tableKey,
}: UseDataTableWorkerBenchmarkArgs) {
  const table = useTable<BenchmarkFeatures, BenchmarkRow, BenchmarkTableState>(
    {
      columns: benchmarkColumns,
      data,
      features: mode === "worker" ? workerFeatures : benchmarkSharedFeatures,
      initialState: {
        pagination: { pageIndex: 0, pageSize: BENCHMARK_PAGE_SIZE },
      },
      key: tableKey,
    },
    (state) => ({
      columnFilters: state.columnFilters,
      pagination: state.pagination,
      sorting: state.sorting,
      workerRowModels: state.workerRowModels,
    })
  );
  const visibleRows = table.getRowModel().rows;
  const workerState = table.state.workerRowModels;

  useEffect(
    function terminateWorkerOnUnmount() {
      if (mode !== "worker") {
        return;
      }
      return () => tableWorker.terminate();
    },
    [mode]
  );

  return {
    filterApplied: table.state.columnFilters.some(
      (filter) => filter.id === "name" && filter.value === BENCHMARK_FILTER
    ),
    filteredRowCount: table.getFilteredRowModel().rows.length,
    filterRows: () => {
      table.setSorting([]);
      table.getColumn("name")?.setFilterValue(BENCHMARK_FILTER);
    },
    firstRow: visibleRows.at(0)?.original.displayName ?? "",
    sortApplied: table.state.sorting.some(
      (sort) => sort.id === "size" && sort.desc
    ),
    sortRows: () => {
      table.getColumn("name")?.setFilterValue(undefined);
      table.setSorting([{ desc: true, id: "size" }]);
    },
    workerComputeMs: workerState.lastComputeMs,
    workerPending: workerState.isPending,
    workerRoundTripMs: workerState.lastRoundTripMs,
    workerVersion: workerState.version,
  };
}

export type { BenchmarkMetric, BenchmarkMode };
export { useDataTableWorkerBenchmark };
