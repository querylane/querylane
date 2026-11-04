import { expect, test } from "@rstest/core";
import { assertBudgetChanges } from "./check-budget-governance";

const baseRevision = "a".repeat(40);
const caps = { maxTotalGzipBytes: 100 };
const basePolicy = { caps, exceptions: [] };
const exception = {
  cap: "maxTotalGzipBytes",
  baseRevision,
  oldBytes: 100,
  newBytes: 101,
  reason: "Measured dependency update; initial download unchanged",
  owner: "querylane-maintainer",
};

test("rejects an unapproved production cap increase", () => {
  expect(() => {
    assertBudgetChanges(
      basePolicy,
      { caps: { maxTotalGzipBytes: 101 }, exceptions: [] },
      baseRevision
    );
  }).toThrow("maxTotalGzipBytes: 100 -> 101 requires a matching exception");
});

test("allows unchanged and lower caps without exceptions", () => {
  expect(() => {
    assertBudgetChanges(basePolicy, { caps, exceptions: [] }, baseRevision);
  }).not.toThrow();
  expect(() => {
    assertBudgetChanges(
      basePolicy,
      { caps: { maxTotalGzipBytes: 99 }, exceptions: [] },
      baseRevision
    );
  }).not.toThrow();
});

test("allows only the exact documented increase on the comparison base", () => {
  expect(() => {
    assertBudgetChanges(
      basePolicy,
      { caps: { maxTotalGzipBytes: 101 }, exceptions: [exception] },
      baseRevision
    );
  }).not.toThrow();
});

test.each([
  { baseRevision: "b".repeat(40) },
  { oldBytes: 99 },
  { newBytes: 102 },
  { cap: "maxInitialGzipBytes" },
  { reason: "  " },
  { owner: "" },
])("rejects stale or incomplete exception %j", (change) => {
  expect(() => {
    assertBudgetChanges(
      basePolicy,
      {
        caps: { maxTotalGzipBytes: 101 },
        exceptions: [{ ...exception, ...change }],
      },
      baseRevision
    );
  }).toThrow();
});

test("rejects reused exceptions without an increase and duplicate approvals", () => {
  expect(() => {
    assertBudgetChanges(
      basePolicy,
      { caps, exceptions: [exception] },
      baseRevision
    );
  }).toThrow("Stale");
  expect(() => {
    assertBudgetChanges(
      basePolicy,
      { caps: { maxTotalGzipBytes: 101 }, exceptions: [exception, exception] },
      baseRevision
    );
  }).toThrow("duplicate");
});

test("missing, renamed and invalid caps cannot disable governance", () => {
  for (const nextCaps of [
    {},
    { maxInitialGzipBytes: 100 },
    { maxTotalGzipBytes: 0 },
    { maxTotalGzipBytes: "101" },
  ]) {
    expect(() => {
      assertBudgetChanges(
        basePolicy,
        { caps: nextCaps, exceptions: [] },
        baseRevision
      );
    }).toThrow();
  }
});

test("unchanged historical exceptions do not strand unrelated cap checks", () => {
  const historical = {
    caps,
    exceptions: [{ ...exception, baseRevision: "b".repeat(40) }],
  };
  expect(() => {
    assertBudgetChanges(historical, historical, baseRevision);
  }).not.toThrow();
});

test("historical exceptions cannot be reused for a new increase", () => {
  const history = { caps, exceptions: [exception] };
  expect(() => {
    assertBudgetChanges(
      history,
      { ...history, caps: { maxTotalGzipBytes: 101 } },
      baseRevision
    );
  }).toThrow("requires a matching exception");
});
