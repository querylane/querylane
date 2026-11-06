const MEMORY_METRICS = [
  "heapBytes",
  "nodes",
  "listeners",
  "documents",
  "dedicatedWorkers",
] as const;
type MemoryMetric = (typeof MEMORY_METRICS)[number];
interface MemorySample extends Record<MemoryMetric, number | null> {
  cycle: number;
  documentId: string;
  elapsedMs: number;
}
interface MemoryAnalysisOptions {
  control?: "retained-dom" | "released-dom";
  errors?: readonly string[];
  expectedSamples?: number;
}
interface MemoryMetricSummary {
  count: number;
  delta: number;
  max: number;
  medianSlopePerCycle: number;
  min: number;
  spread: number;
  sustainedGrowth: boolean;
}
type MemoryStatus =
  | "invalid-collection"
  | "calibration-only"
  | "suspected-growth"
  | "negative-control-failed";
interface MemoryAnalysis {
  blocking: boolean;
  errors: string[];
  metrics: Partial<Record<MemoryMetric, MemoryMetricSummary>>;
  status: MemoryStatus;
}

const MIN_MEMORY_SAMPLES = 4;
const MAX_MEMORY_SAMPLES = 101;

function median(values: number[]): number {
  values.sort((left, right) => left - right);
  const middle = Math.floor(values.length / 2);
  const upper = values[middle] ?? 0;
  const lower = values[middle - 1];
  if (values.length % 2 === 0 && lower !== undefined) {
    return (lower + upper) / 2;
  }
  return upper;
}

function summarize(
  samples: readonly MemorySample[],
  metric: MemoryMetric
): MemoryMetricSummary | undefined {
  const rows = samples.flatMap((sample) => {
    const value = sample[metric];
    return value !== null && Number.isFinite(value) && value >= 0
      ? [{ cycle: sample.cycle, value }]
      : [];
  });
  const first = rows.at(0);
  const last = rows.at(-1);
  if (rows.length !== samples.length || !first || !last) {
    return;
  }
  const slopes = rows.flatMap((left, index) =>
    rows
      .slice(index + 1)
      .map((right) => (right.value - left.value) / (right.cycle - left.cycle))
  );
  const values = rows.map((row) => row.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    count: rows.length,
    min,
    max,
    spread: max - min,
    delta: last.value - first.value,
    medianSlopePerCycle: median(slopes),
    // Directional evidence only: not a calibrated absolute resource budget.
    sustainedGrowth:
      values.length >= MIN_MEMORY_SAMPLES &&
      values.slice(1).every((value, index) => value > (values[index] ?? value)),
  };
}

function validProgress(
  sample: MemorySample,
  previousCycle: number,
  previousTime: number
): boolean {
  return (
    Number.isSafeInteger(sample.cycle) &&
    sample.cycle > previousCycle &&
    Number.isFinite(sample.elapsedMs) &&
    sample.elapsedMs >= 0 &&
    sample.elapsedMs > previousTime
  );
}

function collectionErrors(
  samples: readonly MemorySample[],
  expectedSamples: number | undefined
): string[] {
  const errors: string[] = [];
  if (
    samples.length < MIN_MEMORY_SAMPLES ||
    samples.length > MAX_MEMORY_SAMPLES ||
    (expectedSamples !== undefined && samples.length !== expectedSamples)
  ) {
    errors.push("Expected 4–101 complete comparable samples");
  }
  const documentId = samples[0]?.documentId;
  let previousCycle = -1;
  let previousTime = -1;
  for (const sample of samples) {
    if (
      documentId === undefined ||
      documentId.length === 0 ||
      sample.documentId !== documentId
    ) {
      errors.push("Document identity changed or is missing");
    }
    if (!validProgress(sample, previousCycle, previousTime)) {
      errors.push("Sample cycle/time is invalid or unordered");
    }
    previousCycle = sample.cycle;
    previousTime = sample.elapsedMs;
  }
  return errors;
}

function controlFailed(
  options: MemoryAnalysisOptions,
  metrics: MemoryAnalysis["metrics"]
): boolean {
  const domGrowth =
    metrics.nodes?.sustainedGrowth === true &&
    metrics.listeners?.sustainedGrowth === true;
  return (
    (options.control === "retained-dom" && !domGrowth) ||
    (options.control === "released-dom" && domGrowth)
  );
}

function analyzeMemory(
  samples: readonly MemorySample[],
  options: MemoryAnalysisOptions = {}
): MemoryAnalysis {
  if (samples.length > MAX_MEMORY_SAMPLES) {
    return {
      status: "invalid-collection",
      blocking: true,
      errors: ["Collection exceeds 101 sample bound"],
      metrics: {},
    };
  }
  const errors = [
    ...(options.errors ?? []),
    ...collectionErrors(samples, options.expectedSamples),
  ];
  const metrics: MemoryAnalysis["metrics"] = {};
  for (const metric of MEMORY_METRICS) {
    const summary = summarize(samples, metric);
    if (summary) {
      metrics[metric] = summary;
    } else {
      errors.push(`Missing or invalid required metric: ${metric}`);
    }
  }
  if (errors.length > 0) {
    return { status: "invalid-collection", blocking: true, errors, metrics };
  }
  if (controlFailed(options, metrics)) {
    return {
      status: "negative-control-failed",
      blocking: true,
      errors: [
        "Browser DOM/listener sensitivity control did not match its declared mutation",
      ],
      metrics,
    };
  }
  return {
    status: Object.values(metrics).some((metric) => metric.sustainedGrowth)
      ? "suspected-growth"
      : "calibration-only",
    blocking: false,
    errors,
    metrics,
  };
}

export type {
  MemoryAnalysis,
  MemoryAnalysisOptions,
  MemoryMetric,
  MemoryMetricSummary,
  MemorySample,
  MemoryStatus,
};
export {
  analyzeMemory,
  MAX_MEMORY_SAMPLES,
  MEMORY_METRICS,
  MIN_MEMORY_SAMPLES,
};
