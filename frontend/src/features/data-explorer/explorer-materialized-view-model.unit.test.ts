import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "@rstest/core";
import { isConcurrentRefreshReady } from "@/features/data-explorer/explorer-materialized-view-model";
import {
  type TableIndex,
  TableIndexSchema,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

function index(
  values: Partial<
    Pick<TableIndex, "hasExpression" | "isUnique" | "isValid" | "predicate">
  >
) {
  return create(TableIndexSchema, values);
}

describe("isConcurrentRefreshReady", () => {
  it("requires a populated view and a valid plain unique index", () => {
    const qualifyingIndex = index({ isUnique: true, isValid: true });

    expect(isConcurrentRefreshReady(true, [qualifyingIndex])).toBe(true);
    expect(isConcurrentRefreshReady(false, [qualifyingIndex])).toBe(false);
    expect(
      isConcurrentRefreshReady(true, [
        index({ isUnique: true, isValid: false }),
        index({ isUnique: true, isValid: true, hasExpression: true }),
        index({ isUnique: true, isValid: true, predicate: "active" }),
      ])
    ).toBe(false);
  });
});
