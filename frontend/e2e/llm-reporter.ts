import { basename } from "node:path";
import process, { stdout } from "node:process";
import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "playwright/types/testReporter";

const SLOW_TEST_LIMIT = 15;
const MS_PER_SECOND = 1000;
const FAILURE_OUTPUT_LIMIT = 4000;

type TestStatus = TestResult["status"];

interface CompletedTest {
  duration: number;
  file: string;
  status: TestStatus;
  title: string;
}

function formatDuration(ms: number): string {
  if (ms >= MS_PER_SECOND) {
    return `${(ms / MS_PER_SECOND).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}

function formatTitle(test: TestCase): string {
  const fileName = basename(test.location.file);
  return test
    .titlePath()
    .filter((part) => part && part !== fileName)
    .join(" › ");
}

function statusLabel(status: TestStatus): string {
  switch (status) {
    case "passed":
      return "PASS";
    case "failed":
    case "timedOut":
    case "interrupted":
      return "FAIL";
    case "skipped":
      return "SKIP";
    default:
      return "FAIL";
  }
}

function writeLine(line = "") {
  stdout.write(`${line}\n`);
}

function truncate(value: string): string {
  if (value.length <= FAILURE_OUTPUT_LIMIT) {
    return value;
  }
  return `${value.slice(0, FAILURE_OUTPUT_LIMIT)}\n… truncated …`;
}

class LlmReporter implements Reporter {
  private readonly completed: CompletedTest[] = [];
  private readonly failed: Array<{ output: string; title: string }> = [];

  onTestEnd(test: TestCase, result: TestResult) {
    const completed = {
      duration: result.duration,
      file: test.location.file.replace(`${process.cwd()}/`, ""),
      status: result.status,
      title: formatTitle(test),
    } satisfies CompletedTest;
    this.completed.push(completed);

    writeLine(
      `${statusLabel(completed.status)} ${formatDuration(completed.duration)} ${completed.file} › ${completed.title}`
    );

    if (result.status === "failed" || result.status === "timedOut") {
      const output = result.error?.stack ?? result.error?.message ?? "No error";
      this.failed.push({ output: truncate(output), title: completed.title });
    }
  }

  onEnd(result: FullResult) {
    const passed = this.completed.filter((test) => test.status === "passed");
    const skipped = this.completed.filter((test) => test.status === "skipped");
    const failed = this.completed.filter(
      (test) => test.status !== "passed" && test.status !== "skipped"
    );
    const slowest = [...this.completed]
      .sort((left, right) => right.duration - left.duration)
      .slice(0, SLOW_TEST_LIMIT);

    writeLine();
    writeLine(
      `Playwright e2e summary: status=${result.status} total=${this.completed.length} passed=${passed.length} failed=${failed.length} skipped=${skipped.length} duration=${formatDuration(result.duration)}`
    );
    writeLine(`Slowest ${Math.min(SLOW_TEST_LIMIT, slowest.length)} tests:`);
    for (const [index, test] of slowest.entries()) {
      writeLine(
        `${index + 1}. ${formatDuration(test.duration)} ${test.file} › ${test.title}`
      );
    }

    if (this.failed.length > 0) {
      writeLine();
      writeLine("Failures:");
      for (const failure of this.failed) {
        writeLine(`- ${failure.title}`);
        writeLine(failure.output);
      }
    }
  }
}

export default LlmReporter;
