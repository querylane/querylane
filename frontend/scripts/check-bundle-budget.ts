import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";

const BYTES_PER_KIB = 1024;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(SCRIPT_DIR, "..", "dist");
const INDEX_HTML_PATH = join(DIST_DIR, "index.html");
const BUILD_ASSET_EXTENSION_PATTERN = /\.(?:html|css|js)$/;
const LEADING_SLASH_PATTERN = /^\//;
const MAX_ASYNC_SCRIPT_GZIP_KIB = 130;
const MAX_DEFERRED_VISUALIZATION_GZIP_KIB = 90;
const MAX_DEFERRED_SQL_HIGHLIGHTER_GZIP_KIB = 90;
// Recharts (+ its d3 deps) is lazy-loaded and only pulled in on the instance
// overview metrics panel, so it is split out and guarded separately from core.
// 145 (was 140): the console-pages chunk shares these sources and also grew
// with the instance health section redesign.
const MAX_DEFERRED_CHARTS_GZIP_KIB = 145;
const MAX_INITIAL_GZIP_KIB = 450;
const MAX_INITIAL_SCRIPT_GZIP_KIB = 400;
// 950 (was 900): headroom for the roles and security pages. Deferred database
// visualization chunks are split out and guarded by a separate feature budget.
const MAX_TOTAL_GZIP_KIB = 950;

interface BundleBudgetAsset {
  brotli: number;
  gzip: number;
  path: string;
  raw: number;
}

interface BundleBudgetStats {
  allAssets: BundleBudgetAsset[];
  asyncScripts: BundleBudgetAsset[];
  coreAssets: BundleBudgetAsset[];
  coreTotalBrotli: number;
  coreTotalGzip: number;
  coreTotalRaw: number;
  deferredChartsAssets: BundleBudgetAsset[];
  deferredChartsBrotli: number;
  deferredChartsGzip: number;
  deferredChartsRaw: number;
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

function assetSizes(
  distDir: string,
  relativePath: string
): Pick<BundleBudgetAsset, "brotli" | "gzip" | "raw"> {
  const contents = readFileSync(join(distDir, relativePath));
  return {
    brotli: brotliCompressSync(contents).byteLength,
    gzip: gzipSync(contents).byteLength,
    raw: contents.byteLength,
  };
}

function allBuildAssets(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return allBuildAssets(absolutePath, relativePath);
    }
    return BUILD_ASSET_EXTENSION_PATTERN.test(entry.name) ? [relativePath] : [];
  });
}

function initialAssetPaths(indexHtml: string): string[] {
  const files: string[] = [];
  for (const match of indexHtml.matchAll(
    /<(?:script|link)\b[^>]+(?:src|href)="([^"]+)"/g
  )) {
    const assetPath = match[1];
    if (!assetPath) {
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

function sourceMapSources(distDir: string, relativePath: string): string[] {
  if (!relativePath.endsWith(".js")) {
    return [];
  }
  const sourceMapPath = join(distDir, `${relativePath}.map`);
  if (!existsSync(sourceMapPath)) {
    return [];
  }
  const sourceMap = JSON.parse(readFileSync(sourceMapPath, "utf8")) as {
    sources?: unknown;
  };
  if (!Array.isArray(sourceMap.sources)) {
    return [];
  }
  return sourceMap.sources.filter(
    (source): source is string => typeof source === "string"
  );
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
    // Match only the lazily-imported chart modules, never the whole charts
    // directory: the eager lazy-boundary (metric-chart.tsx) and range picker
    // are bundled into the console-pages route chunk, and matching them would
    // silently exclude that entire chunk from the core budget.
    return (
      normalizedSource.includes("node_modules/recharts/") ||
      normalizedSource.includes("src/components/charts/metric-time-chart") ||
      normalizedSource.includes("src/components/charts/sparkline-chart")
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
}: CollectBundleBudgetStatsInput = {}): BundleBudgetStats {
  if (!existsSync(indexHtmlPath)) {
    throw new Error("Missing dist/index.html. Run `bun run build` first.");
  }

  const indexHtml = readFileSync(indexHtmlPath, "utf8");
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
  const coreAssets = allAssets.filter(
    (asset) =>
      !(
        deferredVisualizationPaths.has(asset.path) ||
        deferredSqlHighlighterPaths.has(asset.path) ||
        deferredChartsPaths.has(asset.path)
      )
  );
  const asyncScripts = allAssets.filter(
    (asset) => asset.path.endsWith(".js") && !files.includes(asset.path)
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
  const maxAsyncScript = asyncScripts.toSorted((a, b) => b.gzip - a.gzip)[0];
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
  const deferredSqlHighlighterRaw = deferredSqlHighlighterAssets.reduce(
    (sum, asset) => sum + asset.raw,
    0
  );

  return {
    allAssets,
    asyncScripts,
    coreAssets,
    coreTotalBrotli,
    coreTotalGzip,
    coreTotalRaw,
    deferredChartsAssets,
    deferredChartsBrotli,
    deferredChartsGzip,
    deferredChartsRaw,
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
  };
}

function check(
  failures: string[],
  label: string,
  actual: number,
  budget: number
) {
  if (actual > budget) {
    failures.push(`${label}: ${formatKiB(actual)} > ${formatKiB(budget)}`);
  }
}

function runBundleBudgetCheck() {
  const stats = collectBundleBudgetStats();
  const failures: string[] = [];

  check(
    failures,
    "initial gzip",
    stats.initialGzip,
    budgets.maxInitialGzipBytes
  );
  check(
    failures,
    "initial script gzip",
    stats.initialScriptGzip,
    budgets.maxInitialScriptGzipBytes
  );
  check(
    failures,
    "core total gzip",
    stats.coreTotalGzip,
    budgets.maxTotalGzipBytes
  );
  check(
    failures,
    "deferred visualization gzip",
    stats.deferredVisualizationGzip,
    budgets.maxDeferredVisualizationGzipBytes
  );
  check(
    failures,
    "deferred SQL highlighter gzip",
    stats.deferredSqlHighlighterGzip,
    budgets.maxDeferredSqlHighlighterGzipBytes
  );
  check(
    failures,
    "deferred charts gzip",
    stats.deferredChartsGzip,
    budgets.maxDeferredChartsGzipBytes
  );
  if (stats.maxAsyncScript) {
    check(
      failures,
      `largest async script (${stats.maxAsyncScript.path})`,
      stats.maxAsyncScript.gzip,
      budgets.maxAsyncScriptGzipBytes
    );
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
  const entryPath = process.argv[1];
  return entryPath
    ? resolve(entryPath) === fileURLToPath(import.meta.url)
    : false;
}

if (isMainModule()) {
  runBundleBudgetCheck();
}

export { collectBundleBudgetStats };
