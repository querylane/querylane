import { describe, expect, test } from "vitest";
import {
  evaluatePerformanceBudget,
  FRONTEND_PERF_BUDGETS,
  runPerformanceBudgetCli,
} from "../../scripts/perf-budgets";

const TEST_NUMBER_1200 = 1200;
const TEST_NUMBER_5501 = 5501;
const TEST_NUMBER_160 = 160;
const TEST_NUMBER_1024 = 1024;

describe("frontend performance budgets", () => {
  test("accepts metrics at or below the configured budget", () => {
    expect(FRONTEND_PERF_BUDGETS["data-explorer-direct-ready-ms"]).toBe(
      TEST_NUMBER_1200
    );
    expect(
      evaluatePerformanceBudget(
        "data-explorer-direct-ready-ms",
        TEST_NUMBER_1200
      )
    ).toEqual({
      actual: 1200,
      budget: 1200,
      label: "Data Explorer direct ready",
      ok: true,
      unit: "ms",
    });
  });

  test("rejects metrics above the configured budget", () => {
    expect(
      evaluatePerformanceBudget("build-real-ms", TEST_NUMBER_5501)
    ).toMatchObject({
      budget: FRONTEND_PERF_BUDGETS["build-real-ms"],
      ok: false,
      unit: "ms",
    });
  });

  test("runs the CLI budget check through a pure interface", () => {
    const output: string[] = [];
    const exitCode = runPerformanceBudgetCli({
      argv: ["bun", "perf-budgets.ts", "build-real-ms", "5500"],
      stderr: () => undefined,
      stdout: (line) => output.push(line),
    });

    expect(exitCode).toBe(0);
    expect(output).toEqual(["Frontend build real time: 5500 ms <= 5500 ms"]);
  });

  test("accepts already-sliced CLI args and formats byte budgets", () => {
    const output: string[] = [];
    const exitCode = runPerformanceBudgetCli({
      argv: [
        "data-explorer-cold-payload-gzip-bytes",
        String(TEST_NUMBER_160 * TEST_NUMBER_1024),
      ],
      stderr: () => undefined,
      stdout: (line) => output.push(line),
    });

    expect(exitCode).toBe(0);
    expect(output).toEqual([
      "Data Explorer cold payload: 160.0 KiB <= 160.0 KiB",
    ]);
  });
});
