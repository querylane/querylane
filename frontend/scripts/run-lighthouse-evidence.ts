import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import process, { env } from "node:process";
import { z } from "zod";
import { isNonEmptyString } from "../src/lib/value-guards";
import {
  assertRegularLighthouseBuild,
  lighthouseOutputIdentity,
  lighthouseSourceIdentity,
  prepareLighthouseBuild,
  verifyLighthouseBuild,
} from "./lighthouse-build-identity";
import {
  loadLighthouseReports,
  summarizeLighthouseReports,
} from "./lighthouse-summary";
import { getChromePath } from "./run-lighthouse-ci";

const ROOT = join(import.meta.dirname, "..");
const OUTPUT = join(ROOT, "dist/lighthouse");
const ASSERTIONS = join(ROOT, ".lighthouseci/assertion-results.json");
// LHCI writes only violations. An empty list plus exit 0 is a passing run.
const assertionsSchema = z.array(
  z.looseObject({
    passed: z.boolean(),
    level: z.enum(["error", "warn", "off"]),
  })
);
const reportSchema = z.looseObject({
  requestedUrl: z.url(),
  finalUrl: z.url(),
  lighthouseVersion: z.string().min(1),
  environment: z.looseObject({ hostUserAgent: z.string().min(1) }),
  configSettings: z.record(z.string(), z.unknown()),
  categories: z.looseObject({
    performance: z.looseObject({ score: z.number().min(0).max(1) }),
    accessibility: z.looseObject({ score: z.number().min(0).max(1) }),
    "best-practices": z.looseObject({ score: z.number().min(0).max(1) }),
    seo: z.looseObject({ score: z.number().min(0).max(1) }),
  }),
  runtimeError: z.undefined().optional(),
});

type AssertionOutcome = "passed" | "thresholds-failed";

function classifyAssertions(
  exitCode: number | null,
  results: unknown
): AssertionOutcome {
  const assertions = assertionsSchema.parse(results);
  const failed = assertions.some(
    (result) => result.level === "error" && !result.passed
  );
  if (exitCode === 0 && !failed) {
    return "passed";
  }
  if (exitCode === 1 && failed) {
    return "thresholds-failed";
  }
  throw new Error(
    `Lighthouse assertion command failed or returned inconsistent evidence (exit ${exitCode})`
  );
}

function command(commandName: string, args: string[]) {
  const result = spawnSync(commandName, args, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      isNonEmptyString(result.stderr)
        ? result.stderr
        : (result.error?.message ?? `${commandName} failed`)
    );
  }
  return result.stdout.trim();
}

function lhci(phase: string, extra: string[] = []) {
  const result = spawnSync(
    "node",
    [
      join(ROOT, "node_modules/@lhci/cli/src/cli.js"),
      phase,
      "--config=lighthouserc.cjs",
      ...extra,
    ],
    {
      cwd: ROOT,
      env: {
        ...env,
        CHROME_PATH: getChromePath(),
        LIGHTHOUSE_UPLOAD_TARGET: "filesystem",
      },
      stdio: "inherit",
    }
  );
  if (result.error) {
    throw result.error;
  }
  return result.status;
}

function requirePhase(phase: string, extra: string[] = []) {
  if (lhci(phase, extra) !== 0) {
    throw new Error(`Lighthouse ${phase} failed`);
  }
}

function validateReports(
  reports: readonly unknown[],
  urls: readonly string[],
  runs: number
) {
  if (reports.length !== urls.length * runs) {
    throw new Error(
      `Expected ${urls.length * runs} Lighthouse reports, found ${reports.length}`
    );
  }
  const parsed = reports.map((report) => reportSchema.parse(report));
  for (const url of urls) {
    if (
      parsed.filter(
        (report) => report.requestedUrl === url && report.finalUrl === url
      ).length !== runs
    ) {
      throw new Error(`Missing fixture-route Lighthouse reports: ${url}`);
    }
  }
  return parsed;
}

interface EvidenceMetadata {
  advisory: boolean;
  assert?: unknown;
  browser?: unknown;
  bun?: string;
  collect?: unknown;
  collection: string;
  configSha256?: string;
  dirty?: boolean;
  error?: string;
  node?: string;
  outputSha256?: string;
  phase: string;
  playwright?: string;
  reportDirectory?: string;
  revision?: string;
  sourceSha256?: string;
  status: "evidence-failed" | AssertionOutcome;
}

function prepareProductionEvidence(metadata: EvidenceMetadata) {
  assertRegularLighthouseBuild(env);
  metadata.phase = "build";
  const buildIdentity = prepareLighthouseBuild({
    source: () => lighthouseSourceIdentity(ROOT),
    output: () => lighthouseOutputIdentity(join(ROOT, "dist")),
    build: () => {
      const result = spawnSync("bun", ["run", "build"], {
        cwd: ROOT,
        stdio: "inherit",
      });
      if (result.status !== 0 || result.error) {
        throw new Error(
          "Production build or byte checks failed; collection not run"
        );
      }
    },
  });
  metadata.revision = command("git", ["rev-parse", "HEAD"]);
  metadata.dirty = command("git", ["status", "--porcelain"]).length > 0;
  metadata.sourceSha256 = buildIdentity.source;
  metadata.outputSha256 = buildIdentity.output;
  mkdirSync(OUTPUT, { recursive: true });
  return buildIdentity;
}

async function runLighthouseEvidence(): Promise<number> {
  mkdirSync(OUTPUT, { recursive: true });
  const metadata: EvidenceMetadata = {
    status: "evidence-failed",
    advisory: true,
    collection: "not-run",
    phase: "prerequisite",
  };
  let summary =
    "No valid Lighthouse evidence collected. This is not a threshold result.";
  let exitCode = 1;
  try {
    const { default: config } = await import("../lighthouserc.cjs");
    metadata.revision = command("git", ["rev-parse", "HEAD"]);
    metadata.dirty = command("git", ["status", "--porcelain"]).length > 0;
    metadata.node = command("node", ["--version"]);
    metadata.bun = command("bun", ["--version"]);
    metadata.playwright = z
      .looseObject({ version: z.string() })
      .parse(
        JSON.parse(
          readFileSync(
            join(ROOT, "node_modules/playwright/package.json"),
            "utf8"
          )
        )
      ).version;
    metadata.configSha256 = createHash("sha256")
      .update(readFileSync(join(ROOT, "lighthouserc.cjs")))
      .digest("hex");
    metadata.collect = config.ci.collect;
    metadata.assert = config.ci.assert;
    const buildIdentity = prepareProductionEvidence(metadata);
    if (existsSync(ASSERTIONS)) {
      unlinkSync(ASSERTIONS);
    }
    metadata.phase = "healthcheck";
    requirePhase("healthcheck", ["--fatal"]);
    metadata.phase = "collect";
    metadata.collection = "failed";
    requirePhase("collect");
    metadata.collection = "complete";
    metadata.phase = "assert";
    const assertionExit = lhci("assert");
    const assertions: unknown = JSON.parse(readFileSync(ASSERTIONS, "utf8"));
    const outcome = classifyAssertions(assertionExit, assertions);
    // Explicit local filesystem target: never temporary public storage.
    metadata.phase = "upload";
    const reportDirectory = mkdtempSync(join(OUTPUT, "run-"));
    metadata.reportDirectory = reportDirectory;
    requirePhase("upload", [
      "--target=filesystem",
      `--outputDir=${reportDirectory}`,
    ]);
    metadata.phase = "validate";
    const reports = validateReports(
      loadLighthouseReports(reportDirectory),
      config.ci.collect.url,
      config.ci.collect.numberOfRuns
    );
    copyFileSync(ASSERTIONS, join(OUTPUT, "assertion-results.json"));
    verifyLighthouseBuild(buildIdentity, {
      source: lighthouseSourceIdentity(ROOT),
      output: lighthouseOutputIdentity(join(ROOT, "dist")),
    });
    metadata.phase = "complete";
    metadata.status = outcome;
    metadata.browser = reports.map((report) => ({
      userAgent: report.environment.hostUserAgent,
      lighthouseVersion: report.lighthouseVersion,
      settings: report.configSettings,
    }));
    summary = `Collection: complete. Thresholds: ${outcome}. Advisory evidence only; not a PR merge check.\n\n${summarizeLighthouseReports(reports)}`;
    exitCode = 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    metadata.error = message;
    console.error(message);
    summary = `Collection/evidence failure: ${message}\n\n${summary}`;
  }
  mkdirSync(OUTPUT, { recursive: true });
  writeFileSync(
    join(OUTPUT, "metadata.json"),
    `${JSON.stringify(metadata, null, 2)}\n`
  );
  writeFileSync(join(OUTPUT, "summary.md"), `${summary}\n`);
  console.log(summary);
  return exitCode;
}

if (import.meta.main) {
  process.exit(await runLighthouseEvidence());
}

export { classifyAssertions, validateReports };
