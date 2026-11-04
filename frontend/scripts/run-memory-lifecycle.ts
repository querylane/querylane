import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import process from "node:process";
import { chromium, type Page } from "playwright";
import { z } from "zod";
import {
  MEMORY_FIXTURE_ID,
  prepareMemoryJourney,
} from "../e2e/memory/memory-journey";
import {
  guardMemoryBuild,
  memoryBuildSchema,
  memorySha256,
} from "./memory-build";
import { collectMemory } from "./memory-collector";
import { analyzeMemory } from "./memory-detector";
import { MEMORY_HELP, parseMemoryArguments } from "./memory-options";

const ROOT = resolve(import.meta.dirname, "..");
const FIXTURE_PATHS = [
  "e2e/memory/memory-journey.ts",
  "e2e/tests/helpers.ts",
  "e2e/tests/data-explorer-fixtures.ts",
  "e2e/visual/console-resource-fixtures.ts",
  "e2e/visual/data-grid-fixtures.ts",
  "e2e/visual/serve-service.ts",
  "src/test/fixtures/console-resource-fixtures.ts",
  "src/test/fixtures/data-grid-fixtures.ts",
];
const MAX_REPORT_BYTES = 1_048_576;
const ACTION_TIMEOUT_MS = 5000;
const NAVIGATION_TIMEOUT_MS = 10_000;
const MAX_ERRORS = 20;
const MAX_ERROR_LENGTH = 1000;
const MAX_FAILURE_LENGTH = 5000;
type MemoryArguments = Extract<
  ReturnType<typeof parseMemoryArguments>,
  { help: false }
>;
type MemoryBuild = z.infer<typeof memoryBuildSchema>;
interface MemoryRunState {
  browserVersion: string | undefined;
  collection: Awaited<ReturnType<typeof collectMemory>> | undefined;
  errors: string[];
}

function sourceIdentity() {
  const require = createRequire(import.meta.url);
  const packageValue: unknown = JSON.parse(
    readFileSync(require.resolve("playwright/package.json"), "utf8")
  );
  const { version } = z.object({ version: z.string() }).parse(packageValue);
  return {
    runnerRevision: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim(),
    dirty:
      execFileSync("git", ["status", "--porcelain"], {
        cwd: ROOT,
        encoding: "utf8",
      }).trim().length > 0,
    node: process.version,
    bun: process.versions["bun"] ?? null,
    playwright: version,
    platform: process.platform,
    collectorHashes: Object.fromEntries(
      [
        "scripts/memory-detector.ts",
        "scripts/memory-collector.ts",
        "scripts/memory-build.ts",
        "scripts/memory-options.ts",
        "scripts/run-memory-lifecycle.ts",
      ].map((path) => [path, memorySha256(readFileSync(join(ROOT, path)))])
    ),
    fixtureId: MEMORY_FIXTURE_ID,
    fixtureHashes: Object.fromEntries(
      FIXTURE_PATHS.map((path) => [
        path,
        memorySha256(readFileSync(join(ROOT, path))),
      ])
    ),
  };
}

async function collectOnPage(
  page: Page,
  input: { args: MemoryArguments; build: MemoryBuild; state: MemoryRunState }
) {
  const { args, build, state } = input;
  page.setDefaultTimeout(ACTION_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
  const guard = await guardMemoryBuild(page, args.url, build);
  await guard.verifyUnchanged();
  const roundTrip = await prepareMemoryJourney(page, args.url);
  state.collection = await collectMemory(page, roundTrip, args.collection);
  await guard.verifyUnchanged();
  if (guard.loadedAssets.size === 0) {
    throw new Error("No production JS/CSS assets were exercised");
  }
}

async function collectProduction(
  args: MemoryArguments,
  build: MemoryBuild,
  state: MemoryRunState
) {
  const { errors } = state;
  const browser = await chromium.launch({
    headless: true,
    timeout: NAVIGATION_TIMEOUT_MS,
  });
  state.browserVersion = browser.version();
  const timeout = setTimeout(() => {
    errors.push("Overall collection deadline exceeded");
    browser.close().catch((error: unknown) => {
      errors.push(`Deadline browser cleanup failed: ${String(error)}`);
    });
  }, args.collection.timeoutMs);
  try {
    const context = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 1280, height: 900 },
      timezoneId: "UTC",
      locale: "en-US",
      reducedMotion: "reduce",
    });
    try {
      const page = await context.newPage();
      const onPageError = (error: Error) => {
        if (errors.length < MAX_ERRORS) {
          errors.push(
            `Runtime error: ${error.message.slice(0, MAX_ERROR_LENGTH)}`
          );
        }
      };
      page.on("pageerror", onPageError);
      try {
        await collectOnPage(page, { args, build, state });
      } finally {
        page.off("pageerror", onPageError);
      }
    } finally {
      await context.close();
    }
  } finally {
    clearTimeout(timeout);
    await browser.close();
  }
}

function failureMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(
    0,
    MAX_FAILURE_LENGTH
  );
}

async function runEvidence(args: MemoryArguments): Promise<number> {
  // New private directory bounds storage to one report and rejects stale evidence.
  mkdirSync(args.outputDir, { mode: 0o700 });
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  const state: MemoryRunState = {
    errors,
    collection: undefined,
    browserVersion: undefined,
  };
  let metadata: ReturnType<typeof sourceIdentity> | undefined;
  let build: MemoryBuild | undefined;
  try {
    metadata = sourceIdentity();
    if (statSync(args.buildManifest).size > MAX_REPORT_BYTES) {
      throw new Error("Build identity exceeds 1 MiB");
    }
    const rawBuild: unknown = JSON.parse(
      readFileSync(args.buildManifest, "utf8")
    );
    build = memoryBuildSchema.parse(rawBuild);
    await collectProduction(args, build, state);
  } catch (error: unknown) {
    errors.push(failureMessage(error));
  }
  const { collection, browserVersion } = state;
  const samples = collection?.samples ?? [];
  const analysis = analyzeMemory(samples, {
    errors: [...(collection?.analysis.errors ?? []), ...errors],
    expectedSamples: args.collection.sampleCount,
  });
  const report = {
    schemaVersion: 1,
    entrypoint: "production-spa-with-hermetic-rpc-fixtures",
    startedAt,
    finishedAt: new Date().toISOString(),
    identity: {
      ...metadata,
      build: build ?? null,
      browserVersion: browserVersion ?? null,
      origin: args.url,
    },
    assumptions: [
      "Build manifest is supplied by the build owner: hashes are verified, revision/mode are attested, not inferred from an existing dist directory.",
      "Service workers blocked for network isolation; not a service-worker lifetime test.",
      "Single-run results are calibration evidence only; no leak or saved-bytes claim.",
    ],
    collection: collection ?? null,
    analysis,
  };
  const json = JSON.stringify(report, null, 2);
  if (Buffer.byteLength(json) > MAX_REPORT_BYTES) {
    throw new Error("Report exceeds 1 MiB storage bound");
  }
  writeFileSync(join(args.outputDir, "memory-report.json"), json, {
    mode: 0o600,
    flag: "wx",
  });
  console.log(
    JSON.stringify({
      status: analysis.status,
      blocking: analysis.blocking,
      sampleCount: samples.length,
      report: join(args.outputDir, "memory-report.json"),
    })
  );
  return analysis.blocking ? 1 : 0;
}

async function main(): Promise<number> {
  let args: ReturnType<typeof parseMemoryArguments>;
  try {
    args = parseMemoryArguments(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  if (args.help) {
    console.log(MEMORY_HELP);
    return 0;
  }
  return await runEvidence(args);
}

if (import.meta.main) {
  main()
    .then((code) => {
      process.exitCode = code;
      return code;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
