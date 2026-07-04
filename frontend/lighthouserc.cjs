"use strict";
const { env } = require("node:process");
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
  const rawRuns = env.LIGHTHOUSE_RUNS?.trim();
  if (!rawRuns) {
    return DEFAULT_LIGHTHOUSE_RUNS;
  }

  const runs = Number.parseInt(rawRuns, 10);
  return Number.isFinite(runs)
    ? Math.max(MIN_LIGHTHOUSE_RUNS, runs)
    : DEFAULT_LIGHTHOUSE_RUNS;
}

function readUploadConfig() {
  const uploadTarget = env.LIGHTHOUSE_UPLOAD_TARGET?.trim();
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

const required = (options) => [
  "error",
  { aggregationMethod: "median-run", ...options },
];

module.exports = {
  ci: {
    assert: {
      assertions: {
        "categories:accessibility": required({ minScore: 1 }),
        "categories:best-practices": required({ minScore: 1 }),
        "categories:performance": required({ minScore: 1 }),
        "categories:seo": required({ minScore: 1 }),
        "cumulative-layout-shift": required({ maxNumericValue: 0.01 }),
        "first-contentful-paint": required({ maxNumericValue: 500 }),
        interactive: required({ maxNumericValue: 1000 }),
        "largest-contentful-paint": required({ maxNumericValue: 1200 }),
        "speed-index": required({ maxNumericValue: 700 }),
        "total-blocking-time": required({ maxNumericValue: 50 }),
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
