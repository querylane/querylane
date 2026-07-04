import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
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
  RowCount_Status,
  RowCountSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import {
  RowIdentity_Source,
  RowIdentitySchema,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

describe("grid status metadata", () => {
  test("status item ids are constrained to known UI semantics", () => {
    expectTypeOf<GridStatusItem["id"]>().toEqualTypeOf<GridStatusId>();
    expectTypeOf<"offset-pagination">().toExtend<GridStatusId>();
    expectTypeOf<"row-actions-limited">().toExtend<GridStatusId>();
    expectTypeOf<"count-estimated">().toExtend<GridStatusId>();
    expectTypeOf<"count-exact">().toExtend<GridStatusId>();
    expectTypeOf<"count-not-requested">().toExtend<GridStatusId>();
  });
  test("warns for offset pagination, missing stable identity, unavailable count, caps, and no PK", () => {
    const items = buildGridStatusItems({
      hasNext: true,
      observedAt: timestampFromDate(new Date("2026-05-21T08:00:00Z")),
      pageSize: 50,
      paginationStrategy: PaginationStrategy.OFFSET,
      rowCount: create(RowCountSchema, {
        status: RowCount_Status.UNAVAILABLE,
      }),
      rowIdentity: create(RowIdentitySchema, {
        source: RowIdentity_Source.OPAQUE_ROW_KEY,
      }),
      rowsReturned: 12,
    });

    expect(items.map((item) => item.id)).toEqual([
      "offset-pagination",
      "no-stable-key",
      "count-unavailable",
      "response-capped",
      "observed-at",
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
      rowCount: create(RowCountSchema, { status: RowCount_Status.ESTIMATED }),
      rowIdentity: create(RowIdentitySchema, {
        source: RowIdentity_Source.UNIQUE_CONSTRAINT,
      }),
      rowsReturned: 50,
    });

    expect(items.map((item) => item.id)).toEqual([
      "count-estimated",
      "row-actions-limited",
    ]);
  });

  test("distinguishes row count modes in the grid status bar", () => {
    const baseArgs = {
      hasNext: false,
      pageSize: 50,
      paginationStrategy: PaginationStrategy.KEYSET,
      rowIdentity: create(RowIdentitySchema, {
        source: RowIdentity_Source.PRIMARY_KEY,
      }),
      rowsReturned: 2,
    };

    const cases = [
      {
        id: "count-not-requested",
        label: "Count not requested",
        status: RowCount_Status.NOT_REQUESTED,
        value: 0n,
      },
      {
        id: "count-estimated",
        label: "Estimated count",
        status: RowCount_Status.ESTIMATED,
        value: 3n,
      },
      {
        id: "count-exact",
        label: "Exact count",
        status: RowCount_Status.AVAILABLE,
        value: 2n,
      },
      {
        id: "count-unavailable",
        label: "Count unavailable",
        status: RowCount_Status.UNAVAILABLE,
        value: 0n,
      },
    ] as const;

    for (const countCase of cases) {
      const items = buildGridStatusItems({
        ...baseArgs,
        rowCount: create(RowCountSchema, {
          status: countCase.status,
          value: countCase.value,
        }),
      });

      expect(items.find((item) => item.id === countCase.id)?.label).toBe(
        countCase.label
      );
    }
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

  test("omits observed status when backend timestamp cannot be formatted", () => {
    const invalidTimestamp = timestampFromDate(
      new Date("2026-05-21T08:00:00Z")
    );
    invalidTimestamp.nanos = Number.NaN;

    const items = buildGridStatusItems({
      hasNext: false,
      observedAt: invalidTimestamp,
      pageSize: 50,
      paginationStrategy: PaginationStrategy.KEYSET,
      rowIdentity: create(RowIdentitySchema, {
        source: RowIdentity_Source.PRIMARY_KEY,
      }),
      rowsReturned: 50,
    });

    expect(items.map((item) => item.id)).not.toContain("observed-at");
  });
});
