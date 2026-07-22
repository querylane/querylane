import { create } from "@bufbuild/protobuf";
import { describe, expect, expectTypeOf, test } from "vitest";
import {
  buildGridStatusItems,
  type GridStatusId,
  type GridStatusItem,
  isResponseCapped,
} from "@/features/data-explorer/table-data/grid-status";
import { ResponseLimitsSchema } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

describe("grid status metadata", () => {
  test("status item ids are constrained to known UI semantics", () => {
    expectTypeOf<GridStatusItem["id"]>().toEqualTypeOf<GridStatusId>();
    expectTypeOf<"response-capped">().toExtend<GridStatusId>();
    expectTypeOf<"offset-pagination">().not.toExtend<GridStatusId>();
    expectTypeOf<"no-stable-key">().not.toExtend<GridStatusId>();
    expectTypeOf<"row-actions-limited">().not.toExtend<GridStatusId>();
    expectTypeOf<"count-estimated">().not.toExtend<GridStatusId>();
    expectTypeOf<"observed-at">().not.toExtend<GridStatusId>();
  });

  test("keeps uncapped grids free of badges", () => {
    const items = buildGridStatusItems({
      hasNext: false,
      pageSize: 50,
      rowsReturned: 2,
    });

    expect(items).toEqual([]);
  });

  test("detects response caps from short pages or exhausted byte budgets", () => {
    expect(
      isResponseCapped({
        hasNext: true,
        pageSize: 50,
        rowsReturned: 49,
      })
    ).toBe(true);
    expect(
      isResponseCapped({
        hasNext: false,
        limits: create(ResponseLimitsSchema, {
          effectiveResponseBytes: 1024n,
          maxResponseBytes: 1024n,
        }),
        pageSize: 50,
        rowsReturned: 50,
      })
    ).toBe(true);
    expect(
      isResponseCapped({
        hasNext: true,
        pageSize: 50,
        rowsReturned: 50,
      })
    ).toBe(false);
  });

  test("keeps response-cap copy user-facing when byte limits are present", () => {
    const items = buildGridStatusItems({
      hasNext: false,
      limits: create(ResponseLimitsSchema, {
        effectiveResponseBytes: 1_048_576n,
        maxResponseBytes: 1_048_576n,
      }),
      pageSize: 50,
      rowsReturned: 50,
    });

    expect(items.map((item) => item.id)).toEqual(["response-capped"]);
    expect(items[0]?.description).toBe(
      "The server shortened this page because the response size limit was reached. Narrow the table or lower rows per page to see more values."
    );
  });
});
