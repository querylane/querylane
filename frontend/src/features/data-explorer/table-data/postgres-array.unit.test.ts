import { describe, expect, test } from "vitest";
import { parsePostgresArrayLiteral } from "@/features/data-explorer/table-data/postgres-array";

describe("parsePostgresArrayLiteral", () => {
  test("parses quoted values, unquoted nulls, and empty arrays", () => {
    expect(parsePostgresArrayLiteral("{}")).toEqual({
      items: [],
      ok: true,
    });
    expect(
      parsePostgresArrayLiteral('{alpha,"needs review","comma, value",NULL}')
    ).toEqual({
      items: [
        { display: "alpha", isNull: false },
        { display: "needs review", isNull: false },
        { display: "comma, value", isNull: false },
        { display: "NULL", isNull: true },
      ],
      ok: true,
    });
  });

  test("preserves nested arrays as nested literal rows", () => {
    expect(parsePostgresArrayLiteral("{{1,2},{3,4}}")).toEqual({
      items: [
        { display: "{1,2}", isNull: false },
        { display: "{3,4}", isNull: false },
      ],
      ok: true,
    });
  });
});
