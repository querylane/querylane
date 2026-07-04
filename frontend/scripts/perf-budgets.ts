#!/usr/bin/env bun

import process from "node:process";

const BYTES_PER_KIB = 1024;
const BUILD_REAL_TIME_BUDGET_MS = 5500;
const DATA_EXPLORER_COLD_PAYLOAD_BUDGET_KIB = 160;
const DATA_EXPLORER_DIRECT_READY_BUDGET_MS = 1200;
const DATA_EXPLORER_OVERVIEW_CLICK_BUDGET_MS = 1000;
const FAILURE_EXIT_CODE = 1;
const SUCCESS_EXIT_CODE = 0;

const FRONTEND_PERF_BUDGETS = {
  "build-real-ms": BUILD_REAL_TIME_BUDGET_MS,
  "data-explorer-cold-payload-gzip-bytes":
    DATA_EXPLORER_COLD_PAYLOAD_BUDGET_KIB * BYTES_PER_KIB,
  "data-explorer-direct-ready-ms": DATA_EXPLORER_DIRECT_READY_BUDGET_MS,
  "data-explorer-overview-click-ms": DATA_EXPLORER_OVERVIEW_CLICK_BUDGET_MS,
} as const;

const FRONTEND_PERF_LABELS = {
  "build-real-ms": "Frontend build real time",
  "data-explorer-cold-payload-gzip-bytes": "Data Explorer cold payload",
  "data-explorer-direct-ready-ms": "Data Explorer direct ready",
  "data-explorer-overview-click-ms": "Data Explorer overview click",
} as const satisfies Record<PerformanceMetricName, string>;

const FRONTEND_PERF_UNITS = {
  "build-real-ms": "ms",
  "data-explorer-cold-payload-gzip-bytes": "bytes",
  "data-explorer-direct-ready-ms": "ms",
  "data-explorer-overview-click-ms": "ms",
} as const satisfies Record<PerformanceMetricName, PerformanceMetricUnit>;

type PerformanceMetricName = keyof typeof FRONTEND_PERF_BUDGETS;
type PerformanceMetricUnit = "bytes" | "ms";

interface PerformanceBudgetResult {
  actual: number;
  budget: number;
  label: string;
  ok: boolean;
  unit: PerformanceMetricUnit;
}

interface PerformanceBudgetCliOptions {
  argv: readonly string[];
  stderr: (line: string) => void;
  stdout: (line: string) => void;
}

function isPerformanceMetricName(
  value: string
): value is PerformanceMetricName {
  return value in FRONTEND_PERF_BUDGETS;
}

function evaluatePerformanceBudget(
  metric: PerformanceMetricName,
  actual: number
): PerformanceBudgetResult {
  const budget = FRONTEND_PERF_BUDGETS[metric];
  return {
    actual,
    budget,
    label: FRONTEND_PERF_LABELS[metric],
    ok: actual <= budget,
    unit: FRONTEND_PERF_UNITS[metric],
  };
}

function formatBudgetValue(value: number, unit: PerformanceMetricUnit): string {
  if (unit === "bytes") {
    return `${(value / BYTES_PER_KIB).toFixed(1)} KiB`;
  }

  return `${value.toFixed(0)} ms`;
}

function formatPerformanceBudgetResult(
  result: PerformanceBudgetResult
): string {
  const comparison = result.ok ? "<=" : ">";
  return `${result.label}: ${formatBudgetValue(result.actual, result.unit)} ${comparison} ${formatBudgetValue(result.budget, result.unit)}`;
}

function parseActual(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function performanceBudgetArgs(
  argv: readonly string[]
): readonly [string | undefined, string | undefined] {
  const [firstArg, secondArg, thirdArg, fourthArg] = argv;
  if (firstArg && isPerformanceMetricName(firstArg)) {
    return [firstArg, secondArg];
  }

  return [thirdArg, fourthArg];
}

function runPerformanceBudgetCli({
  argv,
  stderr,
  stdout,
}: PerformanceBudgetCliOptions): number {
  const [metricArg, actualArg] = performanceBudgetArgs(argv);
  const actual = parseActual(actualArg);

  if (!(metricArg && isPerformanceMetricName(metricArg)) || actual === null) {
    stderr(
      `Usage: bun run scripts/perf-budgets.ts <${Object.keys(FRONTEND_PERF_BUDGETS).join("|")}> <actual>`
    );
    return FAILURE_EXIT_CODE;
  }

  const result = evaluatePerformanceBudget(metricArg, actual);
  stdout(formatPerformanceBudgetResult(result));

  if (!result.ok) {
    return FAILURE_EXIT_CODE;
  }

  return SUCCESS_EXIT_CODE;
}

if (import.meta.main) {
  process.exit(
    runPerformanceBudgetCli({
      argv: process.argv,
      stderr: (line) => console.error(line),
      stdout: (line) => console.log(line),
    })
  );
}

export type {
  PerformanceBudgetCliOptions,
  PerformanceBudgetResult,
  PerformanceMetricName,
};
export {
  evaluatePerformanceBudget,
  FRONTEND_PERF_BUDGETS,
  formatPerformanceBudgetResult,
  runPerformanceBudgetCli,
};
