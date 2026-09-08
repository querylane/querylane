import { describe, expect, test } from "@rstest/core";
import type {
  CatalogObject,
  CatalogSchema,
} from "@/hooks/api/database-catalog";
import {
  buildCatalogTree,
  filterCatalogTree,
  padInsertion,
  qualifiedRelationName,
  quoteIdentifier,
  sampleStatement,
} from "./sql-catalog-model";

function schema(schemaId: string, isSystemSchema = false): CatalogSchema {
  return {
    estimatedRows: 0,
    isSystemSchema,
    lastDdlTime: undefined,
    name: `schemas/${schemaId}`,
    owner: "owner",
    schemaId,
    tableCount: 0,
    totalSizeBytes: 0n,
    viewCount: 0,
  };
}

function object(
  schemaId: string,
  objectId: string,
  kind: "table" | "view" = "table"
): CatalogObject {
  return {
    comment: "",
    isMaterialized: false,
    isPopulated: true,
    isSystem: false,
    kind,
    lastDdlTime: undefined,
    name: `schemas/${schemaId}/${kind}s/${objectId}`,
    objectId,
    owner: "owner",
    rowCount: 0n,
    schemaId,
    sizeBytes: 0n,
    tableType: 0,
  };
}

describe("quoteIdentifier", () => {
  test("leaves plain lower-case identifiers bare", () => {
    expect(quoteIdentifier("customer")).toBe("customer");
    expect(quoteIdentifier("order_items2")).toBe("order_items2");
  });

  test("quotes reserved words, mixed case and special characters", () => {
    expect(quoteIdentifier("user")).toBe('"user"');
    expect(quoteIdentifier("Order")).toBe('"Order"');
    expect(quoteIdentifier('say "hi"')).toBe('"say ""hi"""');
  });
});

describe("qualifiedRelationName", () => {
  test("omits the public schema and qualifies others", () => {
    const base = { isMaterialized: false, kind: "table" as const };
    expect(
      qualifiedRelationName({ ...base, name: "customer", schema: "public" })
    ).toBe("customer");
    expect(
      qualifiedRelationName({ ...base, name: "customer", schema: "crm" })
    ).toBe("crm.customer");
  });
});

describe("padInsertion", () => {
  test("adds a space only after a word character", () => {
    expect(padInsertion("M", "crm.customer")).toBe(" crm.customer");
    expect(padInsertion(" ", "crm.customer")).toBe("crm.customer");
    expect(padInsertion("(", "id")).toBe("id");
    expect(padInsertion("", "id")).toBe("id");
  });
});

describe("sampleStatement", () => {
  test("selects a bounded sample", () => {
    expect(
      sampleStatement({
        isMaterialized: false,
        kind: "view",
        name: "order_summary",
        schema: "commerce",
      })
    ).toBe("SELECT *\nFROM commerce.order_summary\nLIMIT 100;");
  });
});

describe("buildCatalogTree", () => {
  const tree = buildCatalogTree(
    [schema("pg_catalog", true), schema("crm"), schema("billing")],
    [
      object("crm", "ticket", "view"),
      object("crm", "customer"),
      object("crm", "account"),
      object("pg_catalog", "pg_class"),
    ]
  );

  test("orders user schemas alphabetically before system schemas", () => {
    expect(tree.map((node) => node.id)).toEqual([
      "billing",
      "crm",
      "pg_catalog",
    ]);
  });

  test("keeps empty schemas and lists tables before views", () => {
    expect(tree[0]?.relations).toEqual([]);
    expect(tree[1]?.relations.map((relation) => relation.name)).toEqual([
      "account",
      "customer",
      "ticket",
    ]);
  });

  test("filters by relation or schema name", () => {
    expect(
      filterCatalogTree(tree, "cust").map((node) => [
        node.id,
        node.relations.map((relation) => relation.name),
      ])
    ).toEqual([["crm", ["customer"]]]);
    expect(filterCatalogTree(tree, "crm.acc")[0]?.relations).toHaveLength(1);
    expect(filterCatalogTree(tree, "billing")).toHaveLength(1);
    expect(filterCatalogTree(tree, "")).toHaveLength(3);
  });
});
