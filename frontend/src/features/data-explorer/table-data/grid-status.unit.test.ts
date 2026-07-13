import { create } from "@bufbuild/protobuf";
import { describe, expect, expectTypeOf, test } from "vitest";
import {
  buildGridStatusItems,
  type GridStatusId,
  type GridStatusItem,
  hasStableRowIdentity,
  isResponseCapped,
} from "@/features/data-explorer/table-data/grid-status";
import {
  PaginationStrategy,
  ResponseLimitsSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import {
  RowIdentity_Source,
  RowIdentitySchema,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

describe("grid status metadata", () => {
  test("status item ids are constrained to known UI semantics", () => {
    expectTypeOf<GridStatusItem["id"]>().toEqualTypeOf<GridStatusId>();
    expectTypeOf<"offset-pagination">().toExtend<GridStatusId>();
    expectTypeOf<"response-capped">().toExtend<GridStatusId>();
    expectTypeOf<"row-actions-limited">().toExtend<GridStatusId>();
    expectTypeOf<"count-estimated">().not.toExtend<GridStatusId>();
    expectTypeOf<"count-exact">().not.toExtend<GridStatusId>();
    expectTypeOf<"count-not-requested">().not.toExtend<GridStatusId>();
    expectTypeOf<"count-unavailable">().not.toExtend<GridStatusId>();
    expectTypeOf<"observed-at">().not.toExtend<GridStatusId>();
  });
  test("warns for offset pagination, missing stable identity, caps, and no PK", () => {
    const items = buildGridStatusItems({
      hasNext: true,
      pageSize: 50,
      paginationStrategy: PaginationStrategy.OFFSET,
      rowIdentity: create(RowIdentitySchema, {
        source: RowIdentity_Source.OPAQUE_ROW_KEY,
      }),
      rowsReturned: 12,
    });

    expect(items.map((item) => item.id)).toEqual([
      "offset-pagination",
      "no-stable-key",
      "response-capped",
      "row-actions-limited",
    ]);
  });

  test("treats primary and unique identities as stable but only primary key enables row actions", () => {
    expect(
      hasStableRowIdentity(
        create(RowIdentitySchema, { source: RowIdentity_Source.PRIMARY_KEY })
      )
    ).toBe(true);
    expect(
      hasStableRowIdentity(
        create(RowIdentitySchema, {
          source: RowIdentity_Source.UNIQUE_CONSTRAINT,
        })
      )
    ).toBe(true);

    const items = buildGridStatusItems({
      hasNext: false,
      pageSize: 50,
      paginationStrategy: PaginationStrategy.KEYSET,
      rowIdentity: create(RowIdentitySchema, {
        source: RowIdentity_Source.UNIQUE_CONSTRAINT,
      }),
      rowsReturned: 50,
    });

    expect(items.map((item) => item.id)).toEqual(["row-actions-limited"]);
  });

  test("keeps stable primary-key grids free of informational badges", () => {
    const items = buildGridStatusItems({
      hasNext: false,
      pageSize: 50,
      paginationStrategy: PaginationStrategy.KEYSET,
      rowIdentity: create(RowIdentitySchema, {
        source: RowIdentity_Source.PRIMARY_KEY,
      }),
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
      paginationStrategy: PaginationStrategy.KEYSET,
      rowIdentity: create(RowIdentitySchema, {
        source: RowIdentity_Source.PRIMARY_KEY,
      }),
      rowsReturned: 50,
    });

    const capped = items.find((item) => item.id === "response-capped");
    expect(capped?.description).toBe(
      "The server shortened this page because the response size limit was reached. Narrow the table or lower rows per page to see more values."
    );
  });

  test("treats missing row identity as unstable", () => {
    expect(hasStableRowIdentity(undefined)).toBe(false);
  });
});
