import { waitFor } from "@testing-library/dom";
import { expect, test } from "vitest";
import { renderHook } from "vitest-browser-react";
import {
  type BenchmarkMetric,
  type BenchmarkMode,
  useDataTableWorkerBenchmark,
} from "@/features/data-explorer/data-table-worker-benchmark";
import type { BenchmarkRow } from "@/features/data-explorer/data-table-worker-benchmark-config";

const BENCHMARK_TIMEOUT_MS = 120_000;
const BENCHMARK_MATCH_INTERVAL = 1000;
const benchmarkCases = [
  {
    expectedFilteredRows: 10,
    expectedSortedFirstRow: "object_9999",
    rowCount: 10_000,
  },
  {
    expectedFilteredRows: 100,
    expectedSortedFirstRow: "object_99999",
    rowCount: 100_000,
  },
  {
    expectedFilteredRows: 500,
    expectedSortedFirstRow: "object_499999",
    rowCount: 500_000,
  },
] as const;

interface BenchmarkRun {
  filter: BenchmarkMetric;
  mode: BenchmarkMode;
  rowCount: number;
  setupMs: number;
  sort: BenchmarkMetric;
}

function makeBenchmarkRows(rowCount: number): BenchmarkRow[] {
  return Array.from({ length: rowCount }, (_, index) => ({
    displayName:
      index % BENCHMARK_MATCH_INTERVAL === 0
        ? `needle_object_${index}`
        : `object_${index}`,
    kind: index % 4 === 0 ? "view" : "table",
    owner: `owner_${index % 25}`,
    rowCount: index * 11,
    sizeBytes: index,
  }));
}

function startFrameGapMeasurement() {
  const startedAt = performance.now();
  let lastFrameAt = startedAt;
  let maxFrameGapMs = 0;
  let frameRequest: number;

  function trackFrame(now: number) {
    maxFrameGapMs = Math.max(maxFrameGapMs, now - lastFrameAt);
    lastFrameAt = now;
    frameRequest = requestAnimationFrame(trackFrame);
  }

  frameRequest = requestAnimationFrame(trackFrame);

  return () => {
    const finishedAt = performance.now();
    cancelAnimationFrame(frameRequest);
    return {
      elapsedMs: finishedAt - startedAt,
      maxFrameGapMs: Math.max(maxFrameGapMs, finishedAt - lastFrameAt),
    };
  };
}

async function runBenchmark(
  mode: BenchmarkMode,
  rowCount: number
): Promise<BenchmarkRun> {
  const data = makeBenchmarkRows(rowCount);
  const setupStartedAt = performance.now();
  const rendered = await renderHook(() =>
    useDataTableWorkerBenchmark({
      data,
      mode,
      tableKey: `${mode}-${rowCount}`,
    })
  );

  async function measure(operation: "filter" | "sort") {
    const { workerVersion } = rendered.result.current;
    const finish = startFrameGapMeasurement();

    try {
      await rendered.act(async () => {
        const { current } = rendered.result;
        if (operation === "filter") {
          current.filterRows();
        } else {
          current.sortRows();
        }
        await waitFor(
          () => {
            const { current: latest } = rendered.result;
            const operationApplied =
              operation === "filter"
                ? latest.filterApplied
                : latest.sortApplied;
            const workerFinished =
              mode === "sync" ||
              (latest.workerVersion > workerVersion && !latest.workerPending);
            if (!(operationApplied && workerFinished)) {
              throw new Error(`Waiting for ${mode} ${operation}.`);
            }
          },
          { interval: 1, timeout: BENCHMARK_TIMEOUT_MS }
        );
      });
    } catch (error) {
      finish();
      throw error;
    }

    const timing = finish();
    const { current } = rendered.result;
    return {
      ...timing,
      filteredRowCount: current.filteredRowCount,
      firstRow: current.firstRow,
      operation,
      ...(mode === "worker" && current.workerComputeMs !== undefined
        ? { workerComputeMs: current.workerComputeMs }
        : {}),
      ...(mode === "worker" && current.workerRoundTripMs !== undefined
        ? { workerRoundTripMs: current.workerRoundTripMs }
        : {}),
    };
  }

  try {
    await rendered.act(() =>
      waitFor(
        () => {
          const { workerPending, workerVersion } = rendered.result.current;
          if (mode === "worker" && (workerVersion === 0 || workerPending)) {
            throw new Error("Waiting for worker setup.");
          }
        },
        { interval: 1, timeout: BENCHMARK_TIMEOUT_MS }
      )
    );
    const setupMs = performance.now() - setupStartedAt;
    const filter = await measure("filter");
    const sort = await measure("sort");
    return { filter, mode, rowCount, setupMs, sort };
  } finally {
    await rendered.unmount();
  }
}

for (const benchmarkCase of benchmarkCases) {
  test(`compares Data Explorer-shaped row models at ${benchmarkCase.rowCount.toLocaleString()} rows`, {
    skip: String(import.meta.env.MODE) !== "benchmark",
    timeout: BENCHMARK_TIMEOUT_MS,
  }, async () => {
    const sync = await runBenchmark("sync", benchmarkCase.rowCount);
    const worker = await runBenchmark("worker", benchmarkCase.rowCount);

    for (const result of [sync, worker]) {
      expect(result.filter.filteredRowCount).toBe(
        benchmarkCase.expectedFilteredRows
      );
      expect(result.sort.filteredRowCount).toBe(benchmarkCase.rowCount);
      expect(result.sort.firstRow).toBe(benchmarkCase.expectedSortedFirstRow);
      expect(result.filter.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(result.filter.maxFrameGapMs).toBeGreaterThanOrEqual(0);
      expect(result.sort.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(result.sort.maxFrameGapMs).toBeGreaterThanOrEqual(0);
    }

    expect(worker.filter.filteredRowCount).toBe(sync.filter.filteredRowCount);
    expect(worker.sort.firstRow).toBe(sync.sort.firstRow);
    console.info(
      `DATA_EXPLORER_WORKER_BENCHMARK=${JSON.stringify([sync, worker])}`
    );
  });
}
