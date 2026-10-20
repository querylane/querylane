import { expect, test } from "@rstest/core";
import { assertReviewedRuleIds } from "./check-rule-inventory";

test("rejects a new tool rule until its policy is reviewed", () => {
  expect(() => {
    assertReviewedRuleIds(["tool/known"], ["tool/known", "tool/new"]);
  }).toThrow("tool/new");
});
test("rejects stale and duplicate inventory entries", () => {
  expect(() => {
    assertReviewedRuleIds(["tool/removed"], []);
  }).toThrow("tool/removed");
  expect(() => {
    assertReviewedRuleIds(["tool/known", "tool/known"], ["tool/known"]);
  }).toThrow("Duplicate");
});
test("accepts the same reviewed catalog in a different order", () => {
  expect(() => {
    assertReviewedRuleIds(["tool/a", "tool/b"], ["tool/b", "tool/a"]);
  }).not.toThrow();
});
