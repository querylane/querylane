#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

type ReportAsset = {
  path?: unknown;
  size?: unknown;
  gzipSize?: unknown;
};

type ReportChunkGraph = {
  assets?: unknown;
  entrypoints?: unknown;
};

type ReportData = {
  data?: {
    chunkGraph?: ReportChunkGraph;
  };
  chunkGraph?: ReportChunkGraph;
};

type BundleMetrics = {
  totalBytes: number;
  gzipBytes: number | null;
  jsBytes: number;
  cssBytes: number;
  assetCount: number;
  entrypointCount: number;
  assetSizes: Map<string, number>;
};

type MetricRow = {
  name: string;
  baseline: number | null;
  current: number | null;
  unit: "bytes" | "count";
};

const CURRENT_REPORT_PATH = process.argv[2];
const BASELINE_REPORT_PATH = process.argv[3];

if (!CURRENT_REPORT_PATH) {
  console.error(
    "Usage: bun run .github/scripts/compare-bundles.ts <current-report-path> [baseline-report-path]",
  );
  process.exit(1);
}

let currentMetrics: BundleMetrics;

try {
  currentMetrics = await readMetrics(CURRENT_REPORT_PATH);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Unable to read current bundle report: ${message}`);
  process.exit(1);
}

let baselineMetrics: BundleMetrics | null = null;
let baselineNote = "Baseline unavailable: no baseline artifact found on main.";

if (BASELINE_REPORT_PATH) {
  if (existsSync(BASELINE_REPORT_PATH)) {
    try {
      baselineMetrics = await readMetrics(BASELINE_REPORT_PATH);
      baselineNote = "";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      baselineNote = `Baseline unavailable: invalid report at \`${BASELINE_REPORT_PATH}\` (${message}).`;
    }
  } else {
    baselineNote = `Baseline unavailable: \`${BASELINE_REPORT_PATH}\` was not found.`;
  }
}

const markdown: string[] = [];
markdown.push("## Bundle Analysis", "");
markdown.push("### Current summary", "");
markdown.push("| Metric | Value |");
markdown.push("| --- | --- |");
markdown.push(
  `| Total assets size | ${formatValue(currentMetrics.totalBytes, "bytes")} |`,
);
markdown.push(
  `| Total gzip size | ${formatNullableValue(currentMetrics.gzipBytes, "bytes")} |`,
);
markdown.push(`| JavaScript size | ${formatValue(currentMetrics.jsBytes, "bytes")} |`);
markdown.push(`| CSS size | ${formatValue(currentMetrics.cssBytes, "bytes")} |`);
markdown.push(`| Asset count | ${formatValue(currentMetrics.assetCount, "count")} |`);
markdown.push(
  `| Entrypoint count | ${formatValue(currentMetrics.entrypointCount, "count")} |`,
);
markdown.push("");

if (baselineMetrics) {
  const rows: MetricRow[] = [
    {
      name: "Total assets size",
      baseline: baselineMetrics.totalBytes,
      current: currentMetrics.totalBytes,
      unit: "bytes",
    },
    {
      name: "Total gzip size",
      baseline: baselineMetrics.gzipBytes,
      current: currentMetrics.gzipBytes,
      unit: "bytes",
    },
    {
      name: "JavaScript size",
      baseline: baselineMetrics.jsBytes,
      current: currentMetrics.jsBytes,
      unit: "bytes",
    },
    {
      name: "CSS size",
      baseline: baselineMetrics.cssBytes,
      current: currentMetrics.cssBytes,
      unit: "bytes",
    },
    {
      name: "Asset count",
      baseline: baselineMetrics.assetCount,
      current: currentMetrics.assetCount,
      unit: "count",
    },
    {
      name: "Entrypoint count",
      baseline: baselineMetrics.entrypointCount,
      current: currentMetrics.entrypointCount,
      unit: "count",
    },
  ];

  markdown.push("### Delta vs baseline (main)", "");
  markdown.push("| Metric | Baseline | Current | Delta | Delta % |");
  markdown.push("| --- | --- | --- | --- | --- |");

  for (const row of rows) {
    const delta = getDelta(row.current, row.baseline);
    markdown.push(
      `| ${row.name} | ${formatNullableValue(row.baseline, row.unit)} | ${formatNullableValue(row.current, row.unit)} | ${formatNullableDelta(delta, row.unit)} | ${formatDeltaPercent(delta, row.baseline)} |`,
    );
  }

  markdown.push("");
  markdown.push("### Top changed assets", "");
  markdown.push("| Asset | Baseline | Current | Delta |");
  markdown.push("| --- | --- | --- | --- |");

  const changes = computeAssetDiffs(baselineMetrics.assetSizes, currentMetrics.assetSizes);
  if (changes.length === 0) {
    markdown.push("| _No asset size changes detected_ | - | - | - |");
  } else {
    for (const change of changes.slice(0, 10)) {
      markdown.push(
        `| ${escapeTableCell(change.path)} | ${formatValue(change.baseline, "bytes")} | ${formatValue(change.current, "bytes")} | ${formatSignedValue(change.delta, "bytes")} |`,
      );
    }
  }
  markdown.push("");
} else {
  markdown.push(`_${baselineNote}_`, "");
}

console.log(markdown.join("\n"));

async function readMetrics(reportPath: string): Promise<BundleMetrics> {
  let raw: string;
  try {
    raw = await readFile(reportPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`could not read file \`${reportPath}\`: ${message}`);
  }

  let data: ReportData;
  try {
    data = JSON.parse(raw) as ReportData;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid JSON in \`${reportPath}\`: ${message}`);
  }

  const chunkGraph = data.chunkGraph ?? data.data?.chunkGraph;
  if (!chunkGraph || !Array.isArray(chunkGraph.assets)) {
    throw new Error(
      `\`${reportPath}\` does not contain chunkGraph.assets (supported shapes: chunkGraph.assets or data.chunkGraph.assets)`,
    );
  }

  const assets = chunkGraph.assets as ReportAsset[];
  const entrypointCount = Array.isArray(chunkGraph.entrypoints)
    ? chunkGraph.entrypoints.length
    : 0;

  let totalBytes = 0;
  let jsBytes = 0;
  let cssBytes = 0;
  let gzipBytes = 0;
  let hasGzip = false;
  const assetSizes = new Map<string, number>();

  for (const [index, asset] of assets.entries()) {
    const assetPath = getAssetPath(asset.path, index);
    const size = toNumber(asset.size) ?? 0;
    const gzipSize = toNumber(asset.gzipSize);
    const ext = getExtension(assetPath);

    totalBytes += size;
    if (ext === "js" || ext === "mjs" || ext === "cjs") {
      jsBytes += size;
    }
    if (ext === "css") {
      cssBytes += size;
    }

    if (gzipSize !== null) {
      hasGzip = true;
      gzipBytes += gzipSize;
    }

    assetSizes.set(assetPath, (assetSizes.get(assetPath) ?? 0) + size);
  }

  return {
    totalBytes,
    gzipBytes: hasGzip ? gzipBytes : null,
    jsBytes,
    cssBytes,
    assetCount: assets.length,
    entrypointCount,
    assetSizes,
  };
}

function getAssetPath(value: unknown, index: number): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return `(unknown-asset-${index})`;
}

function toNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function getExtension(assetPath: string): string {
  const cleanPath = assetPath.split("?")[0].toLowerCase();
  const dotIndex = cleanPath.lastIndexOf(".");
  return dotIndex >= 0 ? cleanPath.slice(dotIndex + 1) : "";
}

function formatNullableValue(
  value: number | null,
  unit: MetricRow["unit"],
): string {
  if (value === null) {
    return "n/a";
  }
  return formatValue(value, unit);
}

function formatNullableDelta(
  value: number | null,
  unit: MetricRow["unit"],
): string {
  if (value === null) {
    return "n/a";
  }
  return formatSignedValue(value, unit);
}

function formatValue(value: number, unit: MetricRow["unit"]): string {
  if (unit === "count") {
    return value.toLocaleString("en-US");
  }
  return formatBytes(value);
}

function formatSignedValue(value: number, unit: MetricRow["unit"]): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (unit === "count") {
    return `${sign}${abs.toLocaleString("en-US")}`;
  }
  return `${sign}${formatBytes(abs)}`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) {
    return "n/a";
  }
  if (bytes === 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function getDelta(current: number | null, baseline: number | null): number | null {
  if (current === null || baseline === null) {
    return null;
  }
  return current - baseline;
}

function formatDeltaPercent(delta: number | null, baseline: number | null): string {
  if (delta === null || baseline === null || baseline === 0) {
    return "n/a";
  }
  const percent = (delta / baseline) * 100;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(2)}%`;
}

function computeAssetDiffs(
  baseline: Map<string, number>,
  current: Map<string, number>,
): Array<{ path: string; baseline: number; current: number; delta: number }> {
  const paths = new Set<string>([...baseline.keys(), ...current.keys()]);
  const changes: Array<{ path: string; baseline: number; current: number; delta: number }> = [];

  for (const path of paths) {
    const baselineSize = baseline.get(path) ?? 0;
    const currentSize = current.get(path) ?? 0;
    const delta = currentSize - baselineSize;
    if (delta !== 0) {
      changes.push({
        path,
        baseline: baselineSize,
        current: currentSize,
        delta,
      });
    }
  }

  return changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|");
}
