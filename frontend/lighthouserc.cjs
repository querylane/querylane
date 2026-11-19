"use strict";
const { env } = require("node:process");

const runtimeEnv = new Map(Object.entries(env));
const LIGHTHOUSE_PORT = 4173;
const PERF_DEMO_PATH = [
  "instances",
  "production",
  "databases",
  "appdb",
  "explorer",
].join("/");
const PERF_DEMO_QUERY = new URLSearchParams({
  category: "tables",
  name: "orders",
  schema: "public",
}).toString();
const PERF_DEMO_URL = `http://localhost:${LIGHTHOUSE_PORT}/${PERF_DEMO_PATH}?${PERF_DEMO_QUERY}`;
const FILESYSTEM_UPLOAD_TARGET = "filesystem";
const PUBLIC_UPLOAD_TARGET = "temporary-public-storage";
const DEFAULT_LIGHTHOUSE_RUNS = 3;
const MIN_LIGHTHOUSE_RUNS = 1;

function readLighthouseRuns() {
  const rawRuns = runtimeEnv.get("LIGHTHOUSE_RUNS")?.trim();
  if (!(typeof rawRuns === "string" && rawRuns.length > 0)) {
    return DEFAULT_LIGHTHOUSE_RUNS;
  }

  const runs = Number.parseInt(rawRuns, 10);
  return Number.isFinite(runs)
    ? Math.max(MIN_LIGHTHOUSE_RUNS, runs)
    : DEFAULT_LIGHTHOUSE_RUNS;
}

function readUploadConfig() {
  const uploadTarget = runtimeEnv.get("LIGHTHOUSE_UPLOAD_TARGET")?.trim();
  if (uploadTarget === PUBLIC_UPLOAD_TARGET) {
    return { target: PUBLIC_UPLOAD_TARGET };
  }

  return {
    outputDir: "./dist/lighthouse",
    reportFilenamePattern:
      "%%HOSTNAME%%-%%PATHNAME%%-%%DATETIME%%.report.%%EXTENSION%%",
    target: FILESYSTEM_UPLOAD_TARGET,
  };
}

function required(thresholdName = "minScore", threshold = 1) {
  return [
    "error",
    { aggregationMethod: "median-run", [thresholdName]: threshold },
  ];
}

const MAXIMUM_NUMERIC_VALUES = {
  "cumulative-layout-shift": 0.01,
  "first-contentful-paint": 500,
  interactive: 1000,
  "largest-contentful-paint": 1200,
  "speed-index": 700,
  "total-blocking-time": 50,
};

module.exports = {
  ci: {
    assert: {
      assertions: {
        "categories:accessibility": required(),
        "categories:best-practices": required(),
        "categories:performance": required(),
        "categories:seo": required(),
        ...Object.fromEntries(
          Object.entries(MAXIMUM_NUMERIC_VALUES).map(([metric, value]) => [
            metric,
            required("maxNumericValue", value),
          ])
        ),
      },
    },
    collect: {
      isSinglePageApplication: true,
      numberOfRuns: readLighthouseRuns(),
      settings: {
        formFactor: "desktop",
        onlyCategories: [
          "accessibility",
          "best-practices",
          "performance",
          "seo",
        ],
        preset: "desktop",
        screenEmulation: {
          disabled: false,
          height: 1080,
          mobile: false,
          width: 1920,
        },
        throttlingMethod: "provided",
      },
      startServerCommand: "bun run scripts/lighthouse-mock-server.ts",
      startServerReadyPattern: "Lighthouse mock server ready",
      startServerReadyTimeout: 10_000,
      url: [PERF_DEMO_URL],
    },
    upload: readUploadConfig(),
  },
};
