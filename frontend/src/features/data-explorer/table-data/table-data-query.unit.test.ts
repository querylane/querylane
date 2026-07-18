import { describe, expect, test } from "vitest";
import {
  parseSortSearch,
  resolveTableDataQueryState,
  serializeSortSearch,
} from "@/features/data-explorer/table-data/table-data-query";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

const columns = [
  { columnName: "id", dataType: DataType.INTEGER },
  { columnName: "email", dataType: DataType.STRING },
  { columnName: "created_at", dataType: DataType.TIMESTAMP },
];

describe("table data query search", () => {
  test("reports malformed URL filters without normalizing them away", () => {
    const state = resolveTableDataQueryState({
      filterSearch: "not-json",
      sortSearch: "id:sideways,,missing:asc",
    });

    expect(state.filterRules).toEqual([]);
    expect(state.invalidFilterRules).toEqual([
      {
        id: "filter-search",
        message: "Filter URL is malformed. Clear the filter and try again.",
      },
    ]);
    expect(state.sortColumns).toEqual([]);
    expect(state.normalizedFilterSearch).toBe("not-json");
    expect(state.normalizedSortSearch).toBeUndefined();
    expect(state.shouldLoadColumnCatalog).toBe(true);
  });

  test("encodes and decodes sort search params", () => {
    const parsed = parseSortSearch("created_at:desc,id:asc");

    expect(parsed).toEqual([
      { columnKey: "created_at", direction: "DESC" },
      { columnKey: "id", direction: "ASC" },
    ]);
    expect(serializeSortSearch(parsed)).toBe("created_at:desc,id:asc");
  });

  test("round trips sort column names containing URL separators", () => {
    const encoded = serializeSortSearch([
      { columnKey: "quoted:name,part", direction: "DESC" },
      { columnKey: "space name", direction: "ASC" },
    ]);

    expect(encoded).toBe("quoted%3Aname%2Cpart:desc,space%20name:asc");
    expect(parseSortSearch(encoded)).toEqual([
      { columnKey: "quoted:name,part", direction: "DESC" },
      { columnKey: "space name", direction: "ASC" },
    ]);
  });

  test("keeps unknown URL filter columns visible while blocking row reads", () => {
    const filterSearch = JSON.stringify({
      l: "and",
      r: [
        { c: "email", i: "email", o: "ilike", v: "%@acme.com" },
        { c: "missing", i: "missing", o: "eq", v: "x" },
      ],
    });

    const state = resolveTableDataQueryState({
      columnCatalog: columns,
      filterSearch,
      sortSearch: "created_at:desc,missing:asc",
    });

    expect(state.sortColumns).toEqual([
      { columnKey: "created_at", direction: "DESC" },
    ]);
    expect(state.filterRules).toEqual([
      { column: "email", id: "email", operator: "ilike", value: "%@acme.com" },
      { column: "missing", id: "missing", operator: "eq", value: "x" },
    ]);
    expect(state.invalidFilterRules).toEqual([
      { id: "missing", message: "missing is not available." },
    ]);
    expect(state.normalizedSortSearch).toBe("created_at:desc");
    expect(state.normalizedFilterSearch).toBe(filterSearch);
  });

  test("reports invalid typed filter values without building row filters", () => {
    const state = resolveTableDataQueryState({
      columnCatalog: columns,
      filterSearch: JSON.stringify({
        l: "and",
        r: [{ c: "id", i: "id", o: "eq", v: "abc" }],
      }),
    });

    expect(state.invalidFilterRules).toEqual([
      { id: "id", message: "id expects a whole number, like 42." },
    ]);
  });
});
