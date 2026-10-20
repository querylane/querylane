import { expect, test } from "@rstest/core";
import { assertFrontendCiGate } from "./check-ci-gate";

const HEAVY_JOBS = [
  "static",
  "unit",
  "integration",
  "browser",
  "e2e",
  "visual",
  "build",
];

function needs(frontend: string, result: string) {
  return {
    changes: { result: "success", outputs: { frontend } },
    ...Object.fromEntries(HEAVY_JOBS.map((name) => [name, { result }])),
  };
}

test("requires every UI job, including the visual matrix, to succeed", () => {
  expect(() => {
    assertFrontendCiGate(needs("true", "success"));
  }).not.toThrow();
  for (const name of HEAVY_JOBS) {
    for (const result of ["failure", "cancelled", "skipped", undefined]) {
      expect(() => {
        assertFrontendCiGate({
          ...needs("true", "success"),
          [name]: { result },
        });
      }).toThrow();
    }
  }
});

test("passes non-UI changes only after successful change detection", () => {
  expect(() => {
    assertFrontendCiGate(needs("false", "skipped"));
  }).not.toThrow();
  expect(() => {
    assertFrontendCiGate({
      ...needs("false", "skipped"),
      changes: { result: "failure", outputs: { frontend: "false" } },
    });
  }).toThrow();
});

test("rejects malformed, missing, and unknown decisions instead of failing open", () => {
  for (const input of [
    null,
    {},
    [],
    needs("", "skipped"),
    needs("yes", "success"),
    { changes: { result: "success", outputs: { frontend: "false" } } },
  ]) {
    expect(() => {
      assertFrontendCiGate(input);
    }).toThrow();
  }
});
