import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { z } from "zod";
import { isNonEmptyString } from "../src/lib/value-guards";

const BYTES_PER_KIB = 1024;
const SCRIPT_DIR = import.meta.dirname;
const DIST_DIR = join(SCRIPT_DIR, "..", "dist");
const INDEX_HTML_PATH = join(DIST_DIR, "index.html");
const BUILD_ASSET_EXTENSION_PATTERN = /\.(?:html|css|js)$/u;
const LEADING_SLASH_PATTERN = /^\//u;

const UNUSED_CHART_CAPABILITY_PATTERN =
  /node_modules\/(?:@tanstack\/charts\/dist\/(?:canvas|motion|spring)[./-]|d3-scale\/)/u;
const DEVELOPMENT_PROFILER_PATTERN =
  /(?:^|[/@])(?:react-scan|bippy)(?:[./@-]|$)/u;
const MAX_ASYNC_SCRIPT_GZIP_KIB = 130;
const MAX_DEFERRED_VISUALIZATION_GZIP_KIB = 91;
const MAX_DEFERRED_SQL_HIGHLIGHTER_GZIP_KIB = 90;

const MAX_DEFERRED_SQL_EDITOR_GZIP_KIB = 206;

const MAX_DEFERRED_CHARTS_GZIP_KIB = 145;
const MAX_INITIAL_GZIP_KIB = 450;
const MAX_INITIAL_SCRIPT_GZIP_KIB = 400;

const MAX_TOTAL_GZIP_KIB = 1050;

interface BundleBudgetAsset {
  brotli: number;
  gzip: number;
  path: string;
  raw: number;
}

interface BundleBudgetStats {
  allAssets: BundleBudgetAsset[];
  asyncScripts: BundleBudgetAsset[];
  chartContractViolations: string[];
  coreAssets: BundleBudgetAsset[];
  coreTotalBrotli: number;
  coreTotalGzip: number;
  coreTotalRaw: number;
  deferredChartsAssets: BundleBudgetAsset[];
  deferredChartsBrotli: number;
  deferredChartsGzip: number;
  deferredChartsRaw: number;
  deferredSqlEditorAssets: BundleBudgetAsset[];
  deferredSqlEditorBrotli: number;
  deferredSqlEditorGzip: number;
  deferredSqlEditorRaw: number;
  deferredSqlHighlighterAssets: BundleBudgetAsset[];
  deferredSqlHighlighterBrotli: number;
  deferredSqlHighlighterGzip: number;
  deferredSqlHighlighterRaw: number;
  deferredVisualizationAssets: BundleBudgetAsset[];
  deferredVisualizationBrotli: number;
  deferredVisualizationGzip: number;
  deferredVisualizationRaw: number;
  initialAssets: BundleBudgetAsset[];
  initialBrotli: number;
  initialGzip: number;
  initialRaw: number;
  initialRequestCount: number;
  initialScriptBrotli: number;
  initialScriptGzip: number;
  initialScriptRaw: number;
  maxAsyncScript: BundleBudgetAsset | undefined;
  productionContractViolations: string[];
  totalBrotli: number;
  totalGzip: number;
  totalRaw: number;
}

interface CollectBundleBudgetStatsInput {
  distDir?: string | undefined;
  indexHtmlPath?: string | undefined;
}

const budgets = {
  maxAsyncScriptGzipBytes: MAX_ASYNC_SCRIPT_GZIP_KIB * BYTES_PER_KIB,
  maxDeferredChartsGzipBytes: MAX_DEFERRED_CHARTS_GZIP_KIB * BYTES_PER_KIB,
  maxDeferredSqlEditorGzipBytes:
    MAX_DEFERRED_SQL_EDITOR_GZIP_KIB * BYTES_PER_KIB,
  maxDeferredSqlHighlighterGzipBytes:
    MAX_DEFERRED_SQL_HIGHLIGHTER_GZIP_KIB * BYTES_PER_KIB,
  maxDeferredVisualizationGzipBytes:
    MAX_DEFERRED_VISUALIZATION_GZIP_KIB * BYTES_PER_KIB,
  maxInitialGzipBytes: MAX_INITIAL_GZIP_KIB * BYTES_PER_KIB,
  maxInitialScriptGzipBytes: MAX_INITIAL_SCRIPT_GZIP_KIB * BYTES_PER_KIB,
  maxTotalGzipBytes: MAX_TOTAL_GZIP_KIB * BYTES_PER_KIB,
};

const kib = (bytes: number) => bytes / BYTES_PER_KIB;
const formatKiB = (bytes: number) => `${kib(bytes).toFixed(1)} KiB`;

function assetSizes(distDir: string, relativePath: string) {
  const contents = readFileSync(join(distDir, relativePath));
  return {
    brotli: brotliCompressSync(contents).byteLength,
    gzip: gzipSync(contents).byteLength,
    raw: contents.byteLength,
  };
}

const allBuildAssets: (directory: string, prefix?: string) => string[] = (
  directory,
  prefix = ""
) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return allBuildAssets(absolutePath, relativePath);
    }
    return BUILD_ASSET_EXTENSION_PATTERN.test(entry.name) ? [relativePath] : [];
  });

function initialAssetPaths(indexHtml: string) {
  const files: string[] = [];
  for (const match of indexHtml.matchAll(
    /<(?:script|link)\b[^>]+(?:src|href)="(?<capture1>[^"]+)"/gu
  )) {
    const [, assetPath] = match;
    if (!isNonEmptyString(assetPath)) {
      continue;
    }
    if (assetPath.startsWith("http://") || assetPath.startsWith("https://")) {
      continue;
    }
    if (!(assetPath.endsWith(".js") || assetPath.endsWith(".css"))) {
      continue;
    }
    files.push(assetPath.replace(LEADING_SLASH_PATTERN, ""));
  }
  return files;
}

function sourceMapSources(distDir: string, relativePath: string) {
  if (!relativePath.endsWith(".js")) {
    return [];
  }
  const sourceMapPath = join(distDir, `${relativePath}.map`);
  if (!existsSync(sourceMapPath)) {
    return [];
  }
  const sourceMap = z
    .looseObject({ sources: z.array(z.string()) })
    .parse(JSON.parse(readFileSync(sourceMapPath, "utf-8")));
  return sourceMap.sources;
}

function productionContractViolations(
  distDir: string,
  indexHtml: string,
  assets: readonly BundleBudgetAsset[]
) {
  const violations: string[] = [];
  for (const match of indexHtml.matchAll(
    /<script\b[^>]+src=["'](?<source>[^"']+)["']/gu
  )) {
    const source = match.groups?.["source"];
    if (source !== undefined && DEVELOPMENT_PROFILER_PATTERN.test(source)) {
      violations.push(`Development profiler script in index.html: ${source}`);
    }
  }
  return [
    ...violations,
    ...assets.flatMap((asset) =>
      productionAssetViolations(distDir, asset.path)
    ),
  ];
}

function productionAssetViolations(distDir: string, path: string) {
  const violations = DEVELOPMENT_PROFILER_PATTERN.test(path)
    ? [`Development profiler asset: ${path}`]
    : [];
  for (const source of sourceMapSources(distDir, path)) {
    if (DEVELOPMENT_PROFILER_PATTERN.test(source.replaceAll("\\", "/"))) {
      violations.push(`Development profiler in ${path}: ${source}`);
    }
  }
  return violations;
}

function isDeferredVisualizationAsset(distDir: string, relativePath: string) {
  return sourceMapSources(distDir, relativePath).some((source) => {
    const normalizedSource = source.replaceAll("\\", "/");
    return (
      normalizedSource.includes("node_modules/@xyflow/") ||
      normalizedSource.includes("src/features/database-visualization/")
    );
  });
}

function isDeferredChartsAsset(distDir: string, relativePath: string) {
  return sourceMapSources(distDir, relativePath).some((source) => {
    const normalizedSource = source.replaceAll("\\", "/");

    return (
      normalizedSource.includes("node_modules/@tanstack/charts/") ||
      normalizedSource.includes("src/components/charts/metric-time-chart") ||
      normalizedSource.includes("src/components/charts/sparkline-chart")
    );
  });
}

function isDeferredSqlEditorAsset(distDir: string, relativePath: string) {
  return sourceMapSources(distDir, relativePath).some((source) => {
    const normalizedSource = source.replaceAll("\\", "/");
    return (
      normalizedSource.includes("node_modules/@codemirror/") ||
      normalizedSource.includes("node_modules/@lezer/") ||
      normalizedSource.includes("node_modules/sql-formatter/") ||
      normalizedSource.includes("node_modules/react-resizable-panels/") ||
      normalizedSource.includes("src/features/sql-workbench/")
    );
  });
}

function isDeferredSqlHighlighterAsset(distDir: string, relativePath: string) {
  return sourceMapSources(distDir, relativePath).some((source) => {
    const normalizedSource = source.replaceAll("\\", "/");
    return (
      normalizedSource.includes("node_modules/@shikijs/") ||
      normalizedSource.includes("node_modules/shiki/")
    );
  });
}

function collectBundleBudgetStats({
  distDir = DIST_DIR,
  indexHtmlPath = INDEX_HTML_PATH,
}: CollectBundleBudgetStatsInput = {}) {
  if (!existsSync(indexHtmlPath)) {
    throw new Error("Missing dist/index.html. Run `bun run build` first.");
  }

  const indexHtml = readFileSync(indexHtmlPath, "utf-8");
  const files = initialAssetPaths(indexHtml);
  const initialAssets = files.map((path) => ({
    path,
    ...assetSizes(distDir, path),
  }));
  const allAssets = allBuildAssets(distDir).map((path) => ({
    path,
    ...assetSizes(distDir, path),
  }));
  const deferredVisualizationAssets = allAssets.filter((asset) =>
    isDeferredVisualizationAsset(distDir, asset.path)
  );
  const deferredVisualizationPaths = new Set(
    deferredVisualizationAssets.map((asset) => asset.path)
  );
  const deferredSqlHighlighterAssets = allAssets.filter((asset) =>
    isDeferredSqlHighlighterAsset(distDir, asset.path)
  );
  const deferredSqlHighlighterPaths = new Set(
    deferredSqlHighlighterAssets.map((asset) => asset.path)
  );
  const deferredChartsAssets = allAssets.filter((asset) =>
    isDeferredChartsAsset(distDir, asset.path)
  );
  const deferredChartsPaths = new Set(
    deferredChartsAssets.map((asset) => asset.path)
  );
  const deferredSqlEditorAssets = allAssets.filter((asset) =>
    isDeferredSqlEditorAsset(distDir, asset.path)
  );
  const deferredSqlEditorPaths = new Set(
    deferredSqlEditorAssets.map((asset) => asset.path)
  );
  const coreAssets = allAssets.filter(
    (asset) =>
      !(
        deferredVisualizationPaths.has(asset.path) ||
        deferredSqlHighlighterPaths.has(asset.path) ||
        deferredChartsPaths.has(asset.path) ||
        deferredSqlEditorPaths.has(asset.path)
      )
  );
  const initialPaths = new Set(files);
  const chartContractViolations = allAssets.flatMap((asset) => {
    const violations: string[] = [];
    if (initialPaths.has(asset.path) && deferredChartsPaths.has(asset.path)) {
      violations.push(`Chart runtime must stay deferred: ${asset.path}`);
    }
    for (const source of sourceMapSources(distDir, asset.path)) {
      if (UNUSED_CHART_CAPABILITY_PATTERN.test(source.replaceAll("\\", "/"))) {
        violations.push(`Unused chart capability in ${asset.path}: ${source}`);
      }
    }
    return violations;
  });
  const asyncScripts = allAssets.filter(
    (asset) => asset.path.endsWith(".js") && !initialPaths.has(asset.path)
  );

  const initialGzip = initialAssets.reduce((sum, asset) => sum + asset.gzip, 0);
  const initialBrotli = initialAssets.reduce(
    (sum, asset) => sum + asset.brotli,
    0
  );
  const initialRaw = initialAssets.reduce((sum, asset) => sum + asset.raw, 0);
  const initialScriptGzip = initialAssets
    .filter((asset) => asset.path.endsWith(".js"))
    .reduce((sum, asset) => sum + asset.gzip, 0);
  const initialScriptBrotli = initialAssets
    .filter((asset) => asset.path.endsWith(".js"))
    .reduce((sum, asset) => sum + asset.brotli, 0);
  const initialScriptRaw = initialAssets
    .filter((asset) => asset.path.endsWith(".js"))
    .reduce((sum, asset) => sum + asset.raw, 0);
  const [maxAsyncScript] = asyncScripts.toSorted((a, b) => b.gzip - a.gzip);
  const totalGzip = allAssets.reduce((sum, asset) => sum + asset.gzip, 0);
  const totalBrotli = allAssets.reduce((sum, asset) => sum + asset.brotli, 0);
  const totalRaw = allAssets.reduce((sum, asset) => sum + asset.raw, 0);
  const coreTotalGzip = coreAssets.reduce((sum, asset) => sum + asset.gzip, 0);
  const coreTotalBrotli = coreAssets.reduce(
    (sum, asset) => sum + asset.brotli,
    0
  );
  const coreTotalRaw = coreAssets.reduce((sum, asset) => sum + asset.raw, 0);
  const deferredVisualizationGzip = deferredVisualizationAssets.reduce(
    (sum, asset) => sum + asset.gzip,
    0
  );
  const deferredVisualizationBrotli = deferredVisualizationAssets.reduce(
    (sum, asset) => sum + asset.brotli,
    0
  );
  const deferredVisualizationRaw = deferredVisualizationAssets.reduce(
    (sum, asset) => sum + asset.raw,
    0
  );
  const deferredSqlHighlighterGzip = deferredSqlHighlighterAssets.reduce(
    (sum, asset) => sum + asset.gzip,
    0
  );
  const deferredSqlHighlighterBrotli = deferredSqlHighlighterAssets.reduce(
    (sum, asset) => sum + asset.brotli,
    0
  );
  const deferredChartsGzip = deferredChartsAssets.reduce(
    (sum, asset) => sum + asset.gzip,
    0
  );
  const deferredChartsBrotli = deferredChartsAssets.reduce(
    (sum, asset) => sum + asset.brotli,
    0
  );
  const deferredChartsRaw = deferredChartsAssets.reduce(
    (sum, asset) => sum + asset.raw,
    0
  );
  const deferredSqlEditorGzip = deferredSqlEditorAssets.reduce(
    (sum, asset) => sum + asset.gzip,
    0
  );
  const deferredSqlEditorBrotli = deferredSqlEditorAssets.reduce(
    (sum, asset) => sum + asset.brotli,
    0
  );
  const deferredSqlEditorRaw = deferredSqlEditorAssets.reduce(
    (sum, asset) => sum + asset.raw,
    0
  );
  const deferredSqlHighlighterRaw = deferredSqlHighlighterAssets.reduce(
    (sum, asset) => sum + asset.raw,
    0
  );

  return {
    allAssets,
    asyncScripts,
    chartContractViolations,
    productionContractViolations: productionContractViolations(
      distDir,
      indexHtml,
      allAssets
    ),
    coreAssets,
    coreTotalBrotli,
    coreTotalGzip,
    coreTotalRaw,
    deferredChartsAssets,
    deferredChartsBrotli,
    deferredChartsGzip,
    deferredChartsRaw,
    deferredSqlEditorAssets,
    deferredSqlEditorBrotli,
    deferredSqlEditorGzip,
    deferredSqlEditorRaw,
    deferredSqlHighlighterAssets,
    deferredSqlHighlighterBrotli,
    deferredSqlHighlighterGzip,
    deferredSqlHighlighterRaw,
    deferredVisualizationAssets,
    deferredVisualizationBrotli,
    deferredVisualizationGzip,
    deferredVisualizationRaw,
    initialAssets,
    initialBrotli,
    initialGzip,
    initialRaw,
    initialRequestCount: initialAssets.length,
    initialScriptBrotli,
    initialScriptGzip,
    initialScriptRaw,
    maxAsyncScript,
    totalBrotli,
    totalGzip,
    totalRaw,
  } satisfies BundleBudgetStats;
}

function check({
  failures,
  label,
  actual,
  budget,
}: {
  failures: string[];
  label: string;
  actual: number;
  budget: number;
}) {
  if (actual > budget) {
    failures.push(`${label}: ${formatKiB(actual)} > ${formatKiB(budget)}`);
  }
}

function runBundleBudgetCheck() {
  const stats = collectBundleBudgetStats();
  const failures = [
    ...stats.chartContractViolations,
    ...stats.productionContractViolations,
  ];

  check({
    failures,
    label: "initial gzip",
    actual: stats.initialGzip,
    budget: budgets.maxInitialGzipBytes,
  });
  check({
    failures,
    label: "initial script gzip",
    actual: stats.initialScriptGzip,
    budget: budgets.maxInitialScriptGzipBytes,
  });
  check({
    failures,
    label: "core total gzip",
    actual: stats.coreTotalGzip,
    budget: budgets.maxTotalGzipBytes,
  });
  check({
    failures,
    label: "deferred visualization gzip",
    actual: stats.deferredVisualizationGzip,
    budget: budgets.maxDeferredVisualizationGzipBytes,
  });
  check({
    failures,
    label: "deferred SQL highlighter gzip",
    actual: stats.deferredSqlHighlighterGzip,
    budget: budgets.maxDeferredSqlHighlighterGzipBytes,
  });
  check({
    failures,
    label: "deferred charts gzip",
    actual: stats.deferredChartsGzip,
    budget: budgets.maxDeferredChartsGzipBytes,
  });
  check({
    failures,
    label: "deferred SQL editor gzip",
    actual: stats.deferredSqlEditorGzip,
    budget: budgets.maxDeferredSqlEditorGzipBytes,
  });
  if (stats.maxAsyncScript) {
    check({
      failures,
      label: `largest async script (${stats.maxAsyncScript.path})`,
      actual: stats.maxAsyncScript.gzip,
      budget: budgets.maxAsyncScriptGzipBytes,
    });
  }

  console.log(
    [
      `Bundle budget: initial=${formatKiB(stats.initialGzip)}`,
      `initial-br=${formatKiB(stats.initialBrotli)}`,
      `initial-raw=${formatKiB(stats.initialRaw)}`,
      `initial-requests=${stats.initialRequestCount}`,
      `initial-js=${formatKiB(stats.initialScriptGzip)}`,
      `initial-js-br=${formatKiB(stats.initialScriptBrotli)}`,
      `initial-js-raw=${formatKiB(stats.initialScriptRaw)}`,
      `core-total=${formatKiB(stats.coreTotalGzip)}`,
      `core-total-br=${formatKiB(stats.coreTotalBrotli)}`,
      `total=${formatKiB(stats.totalGzip)}`,
      `total-br=${formatKiB(stats.totalBrotli)}`,
      `total-raw=${formatKiB(stats.totalRaw)}`,
      `deferred-visualization=${formatKiB(stats.deferredVisualizationGzip)}`,
      `deferred-visualization-br=${formatKiB(stats.deferredVisualizationBrotli)}`,
      `deferred-sql-highlighter=${formatKiB(stats.deferredSqlHighlighterGzip)}`,
      `deferred-sql-highlighter-br=${formatKiB(stats.deferredSqlHighlighterBrotli)}`,
      `deferred-charts=${formatKiB(stats.deferredChartsGzip)}`,
      `deferred-charts-br=${formatKiB(stats.deferredChartsBrotli)}`,
      `deferred-sql-editor=${formatKiB(stats.deferredSqlEditorGzip)}`,
      `deferred-sql-editor-br=${formatKiB(stats.deferredSqlEditorBrotli)}`,
      stats.maxAsyncScript
        ? `largest-async=${stats.maxAsyncScript.path} ${formatKiB(stats.maxAsyncScript.gzip)} gzip ${formatKiB(stats.maxAsyncScript.brotli)} br`
        : "largest-async=n/a",
    ].join(" ")
  );

  if (failures.length > 0) {
    throw new Error(`Bundle budget exceeded\n${failures.join("\n")}`);
  }
}

function isMainModule() {
  const [, entryPath] = process.argv;
  return isNonEmptyString(entryPath)
    ? resolve(entryPath) === import.meta.filename
    : false;
}

if (isMainModule()) {
  runBundleBudgetCheck();
}

export { collectBundleBudgetStats };
