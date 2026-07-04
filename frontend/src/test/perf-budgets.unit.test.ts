import { describe, expect, test } from "vitest";
import {
  evaluatePerformanceBudget,
  FRONTEND_PERF_BUDGETS,
  runPerformanceBudgetCli,
} from "../../scripts/perf-budgets";

describe("frontend performance budgets", () => {
  test("accepts metrics at or below the configured budget", () => {
    expect(FRONTEND_PERF_BUDGETS["data-explorer-direct-ready-ms"]).toBe(1200);
    expect(
      evaluatePerformanceBudget("data-explorer-direct-ready-ms", 1200)
    ).toEqual({
      actual: 1200,
      budget: 1200,
      label: "Data Explorer direct ready",
      ok: true,
      unit: "ms",
    });
  });

  test("rejects metrics above the configured budget", () => {
    expect(evaluatePerformanceBudget("build-real-ms", 5501)).toMatchObject({
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
      argv: ["data-explorer-cold-payload-gzip-bytes", String(160 * 1024)],
      stderr: () => undefined,
      stdout: (line) => output.push(line),
    });

    expect(exitCode).toBe(0);
    expect(output).toEqual([
      "Data Explorer cold payload: 160.0 KiB <= 160.0 KiB",
    ]);
  });
});
