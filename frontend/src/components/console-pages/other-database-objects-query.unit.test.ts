import { create } from "@bufbuild/protobuf";
import { describe, expect, it, vi } from "vitest";
import {
  fetchOtherDatabaseObjectsSummary,
  fetchOtherObjectsBrowsePage,
  queryRowToObject,
  rowToRecord,
  tableValueToText,
} from "@/components/console-pages/other-database-objects-query";
import {
  buildOtherObjectsBrowseStatement,
  buildOtherObjectsSummaryStatement,
  toLikeContainsLiteral,
  toSqlTextLiteral,
} from "@/components/console-pages/other-database-objects-sql";
import {
  TableCellSchema,
  TableResultRowSchema,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

function stringValue(value: string) {
  return create(TableValueSchema, {
    kind: { case: "stringValue", value },
  });
}

function routineRow(name: string, extra: Record<string, string> = {}) {
  return {
    badge: "FUNCTION",
    category: "routines",
    detail: "",
    name,
    sort_key: name,
    status: "",
    summary: "void · plpgsql · volatile",
    ...extra,
  };
}

describe("other database objects query", () => {
  it("converts streamed table values and rows", () => {
    expect(tableValueToText(stringValue("route"))).toBe("route");
    expect(
      tableValueToText(
        create(TableValueSchema, {
          kind: { case: "int64Value", value: BigInt(42) },
        })
      )
    ).toBe("42");
    expect(
      tableValueToText(
        create(TableValueSchema, {
          kind: { case: "boolValue", value: true },
        })
      )
    ).toBe("true");
    expect(tableValueToText(create(TableValueSchema))).toBe("");

    const row = create(TableResultRowSchema, {
      values: [
        create(TableCellSchema, { value: stringValue("types") }),
        create(TableCellSchema, { value: stringValue("shipping.route") }),
      ],
    });
    expect(rowToRecord(["category", "name"], row)).toEqual({
      category: "types",
      name: "shipping.route",
    });
  });

  it("maps rows to objects and normalizes unknown statuses", () => {
    expect(queryRowToObject(routineRow("shipping.route_eta()"))).toMatchObject({
      category: "routines",
      name: "shipping.route_eta()",
      sortKey: "shipping.route_eta()",
      status: undefined,
    });
    expect(queryRowToObject({ category: "unknown" })).toBeNull();
    expect(
      queryRowToObject(routineRow("f()", { status: "future-status" }))?.status
    ).toBe("warning");
  });

  it("builds a per-category summary with exact totals from window counts", async () => {
    const execute = vi.fn(({ statement }: { statement: string }) => {
      if (statement.includes("has_cron_job_table")) {
        return Promise.resolve([{ has_cron_job_table: "false" }]);
      }
      return Promise.resolve([
        routineRow("a.f()", { category_total: "1234" }),
        routineRow("a.g()", { category_total: "1234" }),
        {
          badge: "SEQUENCE",
          category: "sequences",
          category_total: "2",
          detail: "",
          name: "a.s",
          sort_key: "a:s",
          status: "",
          summary: "last 42",
        },
      ]);
    });

    const summary = await fetchOtherDatabaseObjectsSummary({
      execute,
      parent: "instances/prod/databases/app",
    });

    expect(summary.routines?.total).toBe(1234);
    expect(summary.routines?.objects.map((object) => object.name)).toEqual([
      "a.f()",
      "a.g()",
    ]);
    expect(summary.sequences?.total).toBe(2);
    expect(summary.cronJobs).toBeUndefined();
    const statements = execute.mock.calls.map(([input]) => input.statement);
    expect(statements.some((s) => s.includes("pg_get_functiondef"))).toBe(
      false
    );
  });

  it("pages a category and reports whether more rows exist", async () => {
    const manyRows = Array.from({ length: 101 }, (_, index) =>
      routineRow(`a.f_${String(index).padStart(3, "0")}()`)
    );
    const statements: string[] = [];
    const execute = vi.fn(({ statement }: { statement: string }) => {
      statements.push(statement);
      return Promise.resolve(manyRows);
    });

    const page = await fetchOtherObjectsBrowsePage({
      category: "routines",
      execute,
      parent: "instances/prod/databases/app",
      search: "f_",
    });

    expect(page.objects).toHaveLength(100);
    expect(page.hasMore).toBe(true);
    expect(statements[0]).toContain("ILIKE");
  });

  it("skips the cron category entirely when pg_cron is absent", async () => {
    const execute = vi.fn(() =>
      Promise.resolve([{ has_cron_job_table: "false" }])
    );

    const page = await fetchOtherObjectsBrowsePage({
      category: "cronJobs",
      execute,
      parent: "instances/prod/databases/app",
    });

    expect(page).toEqual({ hasMore: false, objects: [] });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe("other database objects SQL builders", () => {
  it("escapes quotes and LIKE wildcards in search input", () => {
    expect(toSqlTextLiteral("o'reilly")).toBe("'o''reilly'");
    expect(toLikeContainsLiteral("50%_off's")).toBe(
      String.raw`'%50\%\_off''s%' ESCAPE '\'`
    );
  });

  it("only adds search and cursor clauses when provided", () => {
    const plain = buildOtherObjectsBrowseStatement({ category: "sequences" });
    expect(plain).not.toContain("WHERE name");
    expect(plain).toContain("LIMIT 101");

    const filtered = buildOtherObjectsBrowseStatement({
      afterSortKey: "a:s",
      category: "sequences",
      search: "audit",
    });
    expect(filtered).toContain("name ILIKE '%audit%' ESCAPE '\\'");
    expect(filtered).toContain(
      "(lower(sort_key), sort_key) > (lower('a:s'), 'a:s')"
    );
  });

  it("keeps definition-producing functions out of the summary statement", () => {
    const statement = buildOtherObjectsSummaryStatement();
    expect(statement).not.toContain("pg_get_functiondef");
    expect(statement).toContain("count(*) OVER (PARTITION BY category)");
    expect(statement).toContain("row_rank <= 5");
  });
});
