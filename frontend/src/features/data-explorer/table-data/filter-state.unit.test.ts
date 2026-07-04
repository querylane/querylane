import { describe, expect, test } from "vitest";
import {
  buildRowFilter,
  filterRulesForColumnNames,
  getInvalidFilterRules,
  parseTableFilterSearch,
  parseTableFilterSearchResult,
  serializeTableFilterSearch,
  type TableFilterRule,
} from "@/features/data-explorer/table-data/filter-state";
import {
  RowFilterGroup_Logic,
  RowPredicate_Operator,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

const columns = [
  { columnName: "id", dataType: DataType.INTEGER },
  { columnName: "email", dataType: DataType.STRING },
  { columnName: "status", dataType: DataType.STRING },
  { columnName: "external_id", dataType: DataType.STRING },
  { columnName: "active", dataType: DataType.BOOLEAN },
  { columnName: "payload", dataType: DataType.JSON },
  { columnName: "metadata", dataType: DataType.JSON },
  { columnName: "total_cents", dataType: DataType.INTEGER },
  { columnName: "created_at", dataType: DataType.TIMESTAMP },
  { columnName: "deleted_at", dataType: DataType.TIMESTAMP },
];

describe("table filter search params", () => {
  test("round-trips compact filter state", () => {
    const rules: TableFilterRule[] = [
      { column: "email", id: "a", operator: "ilike", value: "%@acme.com" },
      { column: "active", id: "b", operator: "eq", value: "true" },
    ];

    const serialized = serializeTableFilterSearch({ logic: "or", rules });

    expect(parseTableFilterSearch(serialized)).toEqual({ logic: "or", rules });
  });

  test("keeps non-default match logic before a rule is added", () => {
    const serialized = serializeTableFilterSearch({ logic: "or", rules: [] });

    expect(serialized).toBe(JSON.stringify({ l: "or", r: [] }));
    expect(parseTableFilterSearch(serialized)).toEqual({
      logic: "or",
      rules: [],
    });
    expect(
      serializeTableFilterSearch({ logic: "and", rules: [] })
    ).toBeUndefined();
  });

  test("reports malformed URL payloads", () => {
    expect(parseTableFilterSearchResult("not-json")).toEqual({
      error: "Filter URL is malformed. Clear the filter and try again.",
      ok: false,
      state: {
        logic: "and",
        rules: [],
      },
    });
    expect(
      parseTableFilterSearchResult(
        JSON.stringify({ l: "and", r: [{ c: "email", o: "wat" }] })
      )
    ).toEqual({
      error: "Filter URL is malformed. Clear the filter and try again.",
      ok: false,
      state: { logic: "and", rules: [] },
    });
  });

  test("keeps the legacy state parser empty for malformed URL payloads", () => {
    expect(parseTableFilterSearch("not-json")).toEqual({
      logic: "and",
      rules: [],
    });
    expect(
      parseTableFilterSearch(
        JSON.stringify({ l: "and", r: [{ c: "email", o: "wat" }] })
      )
    ).toEqual({ logic: "and", rules: [] });
  });

  test("filters rules against live table columns", () => {
    expect(
      filterRulesForColumnNames(
        [
          { column: "email", id: "a", operator: "eq", value: "x" },
          { column: "missing", id: "b", operator: "eq", value: "x" },
        ],
        ["email"]
      )
    ).toEqual([{ column: "email", id: "a", operator: "eq", value: "x" }]);
  });
});

describe("buildRowFilter", () => {
  test("builds an AND RowFilter group with typed values", () => {
    const filter = buildRowFilter(
      [
        { column: "id", id: "a", operator: "gte", value: "42" },
        { column: "email", id: "b", operator: "ilike", value: "%@acme.com" },
        { column: "active", id: "c", operator: "eq", value: "true" },
      ],
      columns
    );

    expect(filter?.node.case).toBe("group");
    if (filter?.node.case !== "group") {
      throw new Error("expected group filter");
    }
    const group = filter.node.value;
    expect(group).toMatchObject({ logic: RowFilterGroup_Logic.AND });
    expect(group.children).toHaveLength(3);
    expect(group.children[0]?.node.value).toMatchObject({
      column: "id",
      operator: RowPredicate_Operator.GREATER_THAN_OR_EQUAL,
      values: [{ kind: { case: "int64Value", value: 42n } }],
    });
    expect(group.children[1]?.node.value).toMatchObject({
      column: "email",
      operator: RowPredicate_Operator.ILIKE,
      values: [{ kind: { case: "stringValue", value: "%@acme.com" } }],
    });
    expect(group.children[2]?.node.value).toMatchObject({
      column: "active",
      operator: RowPredicate_Operator.EQUAL,
      values: [{ kind: { case: "boolValue", value: true } }],
    });
  });

  test("builds an OR RowFilter group when requested", () => {
    const filter = buildRowFilter(
      [
        { column: "email", id: "a", operator: "ilike", value: "%@acme.com" },
        { column: "active", id: "b", operator: "eq", value: "true" },
      ],
      columns,
      "or"
    );

    if (filter?.node.case !== "group") {
      throw new Error("expected group filter");
    }
    expect(filter.node.value.logic).toBe(RowFilterGroup_Logic.OR);
    expect(filter.node.value.children).toHaveLength(2);
  });

  test("supports null, in, between, and json contains value shapes", () => {
    const filter = buildRowFilter(
      [
        { column: "email", id: "a", operator: "isNull", value: "" },
        { column: "id", id: "b", operator: "in", value: "1, 2" },
        { column: "id", id: "c", operator: "between", value: "3", value2: "9" },
        {
          column: "payload",
          id: "d",
          operator: "jsonContains",
          value: '{"role":"admin"}',
        },
      ],
      columns
    );

    if (filter?.node.case !== "group") {
      throw new Error("expected group filter");
    }
    const predicates = filter.node.value.children.map(
      (child) => child.node.value
    );
    expect(predicates?.[0]).toMatchObject({
      operator: RowPredicate_Operator.IS_NULL,
      values: [],
    });
    expect(predicates?.[1]).toMatchObject({
      operator: RowPredicate_Operator.IN,
      values: [
        { kind: { case: "int64Value", value: 1n } },
        { kind: { case: "int64Value", value: 2n } },
      ],
    });
    expect(predicates?.[2]).toMatchObject({
      operator: RowPredicate_Operator.BETWEEN,
      values: [
        { kind: { case: "int64Value", value: 3n } },
        { kind: { case: "int64Value", value: 9n } },
      ],
    });
    expect(predicates?.[3]).toMatchObject({
      operator: RowPredicate_Operator.JSON_CONTAINS,
      values: [{ kind: { case: "jsonValue", value: '{"role":"admin"}' } }],
    });
  });

  test("models a real customer cleanup filter", () => {
    const filter = buildRowFilter(
      [
        {
          column: "status",
          id: "status",
          operator: "in",
          value: "trial, overdue",
        },
        {
          column: "deleted_at",
          id: "not-deleted",
          operator: "isNull",
          value: "",
        },
        {
          column: "metadata",
          id: "enterprise-tier",
          operator: "jsonContains",
          value: '{"tier":"enterprise"}',
        },
        {
          column: "created_at",
          id: "created-window",
          operator: "between",
          value: "2026-05-01",
          value2: "2026-05-31",
        },
      ],
      columns
    );

    if (filter?.node.case !== "group") {
      throw new Error("expected group filter");
    }
    expect(filter.node.value.logic).toBe(RowFilterGroup_Logic.AND);
    expect(filter.node.value.children).toHaveLength(4);
    expect(filter.node.value.children[0]?.node.value).toMatchObject({
      column: "status",
      operator: RowPredicate_Operator.IN,
      values: [
        { kind: { case: "stringValue", value: "trial" } },
        { kind: { case: "stringValue", value: "overdue" } },
      ],
    });
    expect(filter.node.value.children[1]?.node.value).toMatchObject({
      column: "deleted_at",
      operator: RowPredicate_Operator.IS_NULL,
      values: [],
    });
    expect(filter.node.value.children[2]?.node.value).toMatchObject({
      column: "metadata",
      operator: RowPredicate_Operator.JSON_CONTAINS,
      values: [{ kind: { case: "jsonValue", value: '{"tier":"enterprise"}' } }],
    });
    expect(filter.node.value.children[3]?.node.value).toMatchObject({
      column: "created_at",
      operator: RowPredicate_Operator.BETWEEN,
      values: [
        { kind: { case: "timestampValue", value: "2026-05-01" } },
        { kind: { case: "timestampValue", value: "2026-05-31" } },
      ],
    });
  });

  test("models a real support lookup across email or external id", () => {
    const filter = buildRowFilter(
      [
        {
          column: "email",
          id: "email-domain",
          operator: "ilike",
          value: "%@acme.com",
        },
        {
          column: "external_id",
          id: "stripe-id",
          operator: "eq",
          value: "cus_123",
        },
      ],
      columns,
      "or"
    );

    if (filter?.node.case !== "group") {
      throw new Error("expected group filter");
    }
    expect(filter.node.value.logic).toBe(RowFilterGroup_Logic.OR);
    expect(filter.node.value.children[0]?.node.value).toMatchObject({
      column: "email",
      operator: RowPredicate_Operator.ILIKE,
      values: [{ kind: { case: "stringValue", value: "%@acme.com" } }],
    });
    expect(filter.node.value.children[1]?.node.value).toMatchObject({
      column: "external_id",
      operator: RowPredicate_Operator.EQUAL,
      values: [{ kind: { case: "stringValue", value: "cus_123" } }],
    });
  });

  test("omits incomplete or invalid predicates", () => {
    expect(
      buildRowFilter(
        [
          { column: "id", id: "a", operator: "eq", value: "not-an-int" },
          { column: "email", id: "b", operator: "eq", value: "" },
        ],
        columns
      )
    ).toBeUndefined();
  });

  test("reports invalid values before applying filters", () => {
    expect(
      getInvalidFilterRules(
        [{ column: "active", id: "a", operator: "eq", value: "maybe" }],
        columns
      )
    ).toEqual([{ id: "a", message: "active has an invalid filter value." }]);
  });

  test("treats empty-value rules as incomplete rather than invalid", () => {
    // A freshly added rule starts with an empty value; it must not surface a
    // destructive "Filter not applied" alert or pause the rows query.
    expect(
      getInvalidFilterRules(
        [{ column: "email", id: "fresh", operator: "eq", value: "" }],
        columns
      )
    ).toEqual([]);
  });

  test("treats a partially filled between rule as incomplete", () => {
    expect(
      getInvalidFilterRules(
        [
          {
            column: "id",
            id: "half-between",
            operator: "between",
            value: "1",
            value2: "",
          },
        ],
        columns
      )
    ).toEqual([]);
  });

  test("still reports typed-value errors once a value is present", () => {
    expect(
      getInvalidFilterRules(
        [{ column: "id", id: "typed", operator: "eq", value: "abc" }],
        columns
      )
    ).toEqual([{ id: "typed", message: "id has an invalid filter value." }]);
  });

  test("reports operators incompatible with column type", () => {
    expect(
      getInvalidFilterRules(
        [
          {
            column: "email",
            id: "json-on-text",
            operator: "jsonContains",
            value: "{}",
          },
        ],
        columns
      )
    ).toEqual([
      {
        id: "json-on-text",
        message: "jsonContains cannot be used with email.",
      },
    ]);
  });
});
