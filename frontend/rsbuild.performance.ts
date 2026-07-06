import type { Rspack, SplitChunksConfig } from "@rsbuild/core";

const KIB = 1024;
const ENFORCED_SPLIT_SIZE_KIB = 80;
const MAX_ASYNC_CHUNK_REQUESTS = 30;
const MAX_INITIAL_CHUNK_REQUESTS = 20;
const MIN_SPLIT_SIZE_KIB = 20;

const managedChunkCacheGroups = {
  databaseVisualization: {
    chunks: "async",
    name: "database-visualization",
    priority: 30,
    reuseExistingChunk: true,
    test: /[/\\]node_modules[/\\](?:@xyflow|d3-[^/\\]+)[/\\]/,
  },
  dataGrid: {
    chunks: "async",
    name: "data-grid",
    priority: 32,
    reuseExistingChunk: true,
    test: /[/\\]node_modules[/\\]react-data-grid[/\\]/,
  },
  observabilityPostHog: {
    chunks: "async",
    name: "posthog",
    priority: 35,
    reuseExistingChunk: true,
    test: /[/\\]node_modules[/\\]posthog-js[/\\]/,
  },
  observabilitySentry: {
    chunks: "async",
    name: "sentry",
    priority: 35,
    reuseExistingChunk: true,
    test: /[/\\]node_modules[/\\](?:@sentry|@sentry-internal)[/\\]/,
  },
  protobufRpc: {
    chunks: "async",
    name: "protobuf",
    priority: 20,
    reuseExistingChunk: true,
    test: /[/\\]node_modules[/\\](?:@bufbuild|@connectrpc)[/\\]/,
  },
  sharedUi: {
    chunks: "async",
    minChunks: 2,
    name: "shared-ui",
    priority: 28,
    reuseExistingChunk: true,
    test: /[/\\]src[/\\]components[/\\]ui[/\\]/,
  },
  sqlHighlighter: {
    chunks: "async",
    name: "sql-highlighter",
    priority: 30,
    reuseExistingChunk: true,
    test: /[/\\]node_modules[/\\](?:@shikijs|shiki|oniguruma-parser|oniguruma-to-es)[/\\]/,
  },
  uiVendor: {
    chunks: "async",
    name: "ui-vendor",
    priority: 10,
    reuseExistingChunk: true,
    test: /[/\\]node_modules[/\\](?:@base-ui|lucide-react)[/\\]/,
  },
} satisfies NonNullable<SplitChunksConfig["cacheGroups"]>;

const managedChunkGroupNames = Object.keys(managedChunkCacheGroups) as Array<
  keyof typeof managedChunkCacheGroups
>;

const managedSplitChunksConfig = {
  cacheGroups: managedChunkCacheGroups,
  chunks: "all",
  enforceSizeThreshold: ENFORCED_SPLIT_SIZE_KIB * KIB,
  hidePathInfo: true,
  maxAsyncRequests: MAX_ASYNC_CHUNK_REQUESTS,
  maxInitialRequests: MAX_INITIAL_CHUNK_REQUESTS,
  minSize: MIN_SPLIT_SIZE_KIB * KIB,
  preset: "default",
} satisfies SplitChunksConfig;

const productionOptimizationOverrides = {
  chunkIds: "deterministic",
  concatenateModules: true,
  emitOnErrors: false,
  innerGraph: true,
  mangleExports: "size",
  mergeDuplicateChunks: true,
  moduleIds: "deterministic",
  providedExports: true,
  realContentHash: true,
  removeEmptyChunks: true,
  sideEffects: true,
  usedExports: true,
} satisfies Rspack.Configuration["optimization"];

interface BuildCacheDigestInput {
  env: Record<string, string | undefined>;
  rsdoctorEnabled: boolean;
  sentryUploadEnabled: boolean;
}

interface PreconnectOriginInput {
  apiBaseUrl?: string | undefined;
  isProduction: boolean;
  postHogApiKey?: string | undefined;
  postHogHost?: string | undefined;
}

function httpOrigin(rawValue: string | undefined) {
  const trimmedValue = rawValue?.trim();
  if (!trimmedValue) {
    return;
  }

  try {
    const url = new URL(trimmedValue);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.origin;
    }
  } catch {
    return;
  }

  return;
}

function createBuildCacheDigest({
  env,
  rsdoctorEnabled,
  sentryUploadEnabled,
}: BuildCacheDigestInput) {
  return [
    JSON.stringify(
      Object.fromEntries(
        Object.entries(env)
          .filter(
            ([key, value]) =>
              key.startsWith("PUBLIC_") && typeof value === "string"
          )
          .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      )
    ),
    env["NODE_ENV"] ?? "",
    `rsdoctor:${String(rsdoctorEnabled)}`,
    `sentry-upload:${String(sentryUploadEnabled)}`,
  ];
}

function createPreconnectOrigins({
  apiBaseUrl,
  isProduction,
  postHogApiKey,
  postHogHost,
}: PreconnectOriginInput) {
  if (!isProduction) {
    return [];
  }

  const origins = [
    httpOrigin(apiBaseUrl),
    postHogApiKey?.trim() ? httpOrigin(postHogHost) : undefined,
  ].filter((origin): origin is string => typeof origin === "string");

  return Array.from(new Set(origins));
}

function getManagedChunkGroupNames() {
  return [...managedChunkGroupNames];
}

export {
  createBuildCacheDigest,
  createPreconnectOrigins,
  getManagedChunkGroupNames,
  managedSplitChunksConfig,
  productionOptimizationOverrides,
};
