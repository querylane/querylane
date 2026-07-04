import { describe, expect, test } from "vitest";
import { collectQueryErrors } from "@/features/data-explorer/table-detail-query-state";

describe("collectQueryErrors", () => {
  test("keeps every failed query with its real endpoint", () => {
    const constraintsError = new Error("constraints failed");
    const indexesError = new Error("indexes failed");

    expect(
      collectQueryErrors(
        {
          endpoint: "ListTableColumns",
          label: "Columns",
          query: { error: undefined },
        },
        {
          endpoint: "ListTableConstraints",
          label: "Constraints",
          query: { error: constraintsError },
        },
        {
          endpoint: "ListTableIndexes",
          label: "Indexes",
          query: { error: indexesError },
        }
      )
    ).toEqual([
      {
        endpoint: "ListTableConstraints",
        error: constraintsError,
        label: "Constraints",
      },
      {
        endpoint: "ListTableIndexes",
        error: indexesError,
        label: "Indexes",
      },
    ]);
  });
});
