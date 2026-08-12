import { describe, expect, test } from "@rstest/core";
import {
  formatUnexpectedConsoleIssues,
  type UnexpectedConsoleIssue,
} from "../test.console-guard";

describe("console issue guard", () => {
  test("formats every unexpected console warning and error", () => {
    const issues: UnexpectedConsoleIssue[] = [
      { args: ["slow test warning"], level: "warn" },
      { args: [new Error("act warning")], level: "error" },
    ];

    expect(formatUnexpectedConsoleIssues(issues)).toContain(
      "Unexpected console output during test run"
    );
    expect(formatUnexpectedConsoleIssues(issues)).toContain(
      "console.warn: slow test warning"
    );
    expect(formatUnexpectedConsoleIssues(issues)).toContain(
      "console.error: Error: act warning"
    );
  });
});
