import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  getItemsForCategory,
  highlightMatch,
  matchesQuery,
  pickDefaultSchema,
  type SchemaSummary,
} from "@/features/data-explorer/data-explorer-model";
import {
  DEFAULT_TABLE_LIST_SORT,
  tableListSortToOrderBy,
} from "@/features/data-explorer/data-explorer-table-list-sort";
import { Table_TableType } from "@/protogen/querylane/console/v1alpha1/table_pb";
import { View_ViewType } from "@/protogen/querylane/console/v1alpha1/view_pb";

const schemas: SchemaSummary[] = [
  { id: "audit", name: "audit", owner: "postgres" },
  { id: "public", name: "public", owner: "postgres" },
];

describe("data explorer model", () => {
  test("prefers the public schema as the default", () => {
    expect(pickDefaultSchema(schemas)).toEqual({
      id: "public",
      name: "public",
      owner: "postgres",
    });
  });

  test("falls back to the first schema when public is absent", () => {
    expect(
      pickDefaultSchema([{ id: "audit", name: "audit", owner: "postgres" }])
    ).toEqual({
      id: "audit",
      name: "audit",
      owner: "postgres",
    });
    expect(pickDefaultSchema([])).toBeNull();
  });

  test("matches resource names case-insensitively", () => {
    expect(matchesQuery("CustomerOrders", "orders")).toBe(true);
    expect(matchesQuery("CustomerOrders", "invoice")).toBe(false);
    expect(matchesQuery("CustomerOrders", "")).toBe(true);
  });

  test("returns plain text when there is no highlight match", () => {
    expect(
      renderToStaticMarkup(
        <span>{highlightMatch("CustomerOrders", "invoice")}</span>
      )
    ).toBe("<span>CustomerOrders</span>");
  });

  test("highlights the matching name segment", () => {
    expect(
      renderToStaticMarkup(
        <span>{highlightMatch("CustomerOrders", "orders")}</span>
      )
    ).toContain("<mark");
    expect(
      renderToStaticMarkup(
        <span>{highlightMatch("CustomerOrders", "orders")}</span>
      )
    ).toContain("Orders");
  });

  test("maps table sidebar sort choices to catalog order_by values", () => {
    expect(DEFAULT_TABLE_LIST_SORT).toBe("name-asc");
    expect(tableListSortToOrderBy("name-asc")).toBe("name asc");
    expect(tableListSortToOrderBy("size-desc")).toBe(
      "size_bytes desc, name asc"
    );
    expect(tableListSortToOrderBy("size-asc")).toBe("size_bytes asc, name asc");
  });

  test("badges partitioned roots and keeps other table types unbadged", () => {
    expect(
      getItemsForCategory(
        "tables",
        [
          {
            id: "customers",
            name: "customers",
            rowCount: 0n,
            sizeBytes: 0n,
            type: Table_TableType.BASE_TABLE,
          },
          {
            id: "events",
            name: "events",
            rowCount: 0n,
            sizeBytes: 0n,
            type: Table_TableType.PARTITIONED,
          },
          {
            id: "remote_orders",
            name: "remote_orders",
            rowCount: 0n,
            sizeBytes: 0n,
            type: Table_TableType.EXTERNAL,
          },
          {
            id: "session_export",
            name: "session_export",
            rowCount: 0n,
            sizeBytes: 0n,
            type: Table_TableType.TEMPORARY,
          },
        ],
        []
      )
    ).toEqual([
      {
        badge: undefined,
        name: "customers",
        objectType: "table",
        sizeLabel: "0 B",
      },
      {
        badge: { label: "part", tone: "violet" },
        name: "events",
        objectType: "partitioned",
        sizeLabel: "0 B",
      },
      {
        badge: undefined,
        name: "remote_orders",
        objectType: "table",
        sizeLabel: "0 B",
      },
      {
        badge: undefined,
        name: "session_export",
        objectType: "table",
        sizeLabel: "0 B",
      },
    ]);
  });

  test("adds resource badges for materialized views", () => {
    expect(
      getItemsForCategory(
        "views",
        [],
        [
          {
            id: "rollup",
            name: "rollup",
            rowCount: 0n,
            sizeBytes: 0n,
            type: View_ViewType.MATERIALIZED,
          },
        ]
      )
    ).toEqual([
      {
        badge: { label: "mat", tone: "violet" },
        name: "rollup",
        objectType: "materialized",
      },
    ]);
  });
});
