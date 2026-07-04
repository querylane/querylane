import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import process from "node:process";
import { z } from "zod";

const assertionResultSchema = z
  .object({
    ancestorTitles: z.array(z.string()).optional(),
    duration: z.number().nullable().optional(),
    failureMessages: z.array(z.string()).optional(),
    status: z.string().optional(),
    title: z.string().optional(),
  })
  .passthrough();

const suiteResultSchema = z
  .object({
    assertionResults: z.array(assertionResultSchema).optional(),
    endTime: z.number().optional(),
    name: z.string().optional(),
    startTime: z.number().optional(),
  })
  .passthrough();

const vitestJsonResultSchema = z
  .object({
    numFailedTests: z.number().optional(),
    numPassedTests: z.number().optional(),
    numTotalTests: z.number().optional(),
    success: z.boolean().optional(),
    testResults: z.array(suiteResultSchema).optional(),
  })
  .passthrough();

type VitestJsonResult = z.infer<typeof vitestJsonResultSchema>;

interface TestSummaryRow {
  duration: number;
  failure: string;
  file: string;
  name: string;
  status: string;
}

const FAILURE_TEXT_LIMIT = 500;
const projectRoot = process.cwd();
const files = process.argv.slice(2);

const tests: TestSummaryRow[] = [];
const totals = {
  failed: 0,
  passed: 0,
  total: 0,
};
let earliestStart = Number.POSITIVE_INFINITY;
let latestEnd = 0;

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function parseVitestReport(file: string): VitestJsonResult | null {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return vitestJsonResultSchema.parse(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Skipping unreadable Vitest report ${file}: ${message}`);
    return null;
  }
}

for (const file of files) {
  if (!existsSync(file)) {
    console.log(`Skipping missing Vitest report: ${file}`);
    continue;
  }

  const result = parseVitestReport(file);
  if (!result) {
    continue;
  }

  totals.failed += result.numFailedTests ?? 0;
  totals.passed += result.numPassedTests ?? 0;
  totals.total += result.numTotalTests ?? 0;

  for (const suite of result.testResults ?? []) {
    if (suite.startTime !== undefined) {
      earliestStart = Math.min(earliestStart, suite.startTime);
    }
    if (suite.endTime !== undefined) {
      latestEnd = Math.max(latestEnd, suite.endTime);
    }

    for (const assertion of suite.assertionResults ?? []) {
      tests.push({
        duration: assertion.duration ?? 0,
        failure: (assertion.failureMessages ?? []).join("\n"),
        file: suite.name ? relative(projectRoot, suite.name) : "unknown",
        name: [...(assertion.ancestorTitles ?? []), assertion.title ?? ""]
          .filter(Boolean)
          .join(" > "),
        status: assertion.status ?? "unknown",
      });
    }
  }
}

const runtimeMs = Number.isFinite(earliestStart)
  ? latestEnd - earliestStart
  : 0;
const failedTests = tests.filter((test) => test.status === "failed");
console.log("# Vitest summary");
console.log("");
console.log(
  `Total: ${totals.total} | Passed: ${totals.passed} | Failed: ${totals.failed} | Runtime: ${runtimeMs.toFixed(0)}ms`
);

if (failedTests.length > 0) {
  console.log("");
  console.log("## Failed tests");
  console.log("");
  console.log("| test | file | failure | runtime ms |");
  console.log("| --- | --- | --- | ---: |");
  for (const test of failedTests) {
    console.log(
      `| ${markdownCell(test.name)} | ${test.file} | ${markdownCell(truncate(test.failure, FAILURE_TEXT_LIMIT))} | ${test.duration.toFixed(1)} |`
    );
  }
}
