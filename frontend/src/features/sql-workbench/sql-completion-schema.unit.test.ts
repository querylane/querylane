import { describe, expect, it } from "@rstest/core";
import {
  buildCompletionNamespace,
  type CompletionRelation,
  extractReferencedRelations,
  isRelationPosition,
  relationKey,
} from "@/features/sql-workbench/sql-completion-schema";

const RELATIONS: CompletionRelation[] = [
  { isMaterialized: false, kind: "table", name: "users", schema: "public" },
  { isMaterialized: false, kind: "table", name: "orders", schema: "public" },
  { isMaterialized: false, kind: "table", name: "orders", schema: "archive" },
  {
    isMaterialized: false,
    kind: "view",
    name: "Daily Rollup",
    schema: "analytics",
  },
  { isMaterialized: false, kind: "table", name: "events", schema: "analytics" },
  {
    isMaterialized: true,
    kind: "view",
    name: "rollup_cache",
    schema: "analytics",
  },
];

describe("extractReferencedRelations", () => {
  it("resolves unqualified names to public first and qualified names exactly", () => {
    const found = extractReferencedRelations(
      "select * from orders o join archive.orders a on a.id = o.id",
      RELATIONS
    );
    expect(found).toEqual([
      { name: "orders", schema: "public" },
      { name: "orders", schema: "archive" },
    ]);
  });

  it("falls back to the first schema holding an unqualified name", () => {
    expect(
      extractReferencedRelations("SELECT 1 FROM events", RELATIONS)
    ).toEqual([{ name: "events", schema: "analytics" }]);
  });

  it("understands quoted identifiers and skips unknown or keyword targets", () => {
    const found = extractReferencedRelations(
      `select * from analytics."Daily Rollup" r, from unnest(x), from (select 1) s, from nowhere`,
      RELATIONS
    );
    expect(found).toEqual([{ name: "Daily Rollup", schema: "analytics" }]);
  });

  it("deduplicates repeated references", () => {
    const found = extractReferencedRelations(
      "select * from users u join users u2 on u.id = u2.id",
      RELATIONS
    );
    expect(found).toHaveLength(1);
  });
});

describe("buildCompletionNamespace", () => {
  it("nests relations under schemas and attaches known columns", () => {
    const columns = new Map([
      [
        relationKey("public", "users"),
        [
          { isPrimaryKey: true, name: "id", type: "integer" },
          { isPrimaryKey: false, name: "email", type: "text" },
        ],
      ],
    ]);
    const namespace = buildCompletionNamespace({
      columns,
      relations: RELATIONS,
    }) as Record<
      string,
      { children: Record<string, unknown>; self: { label: string } }
    >;

    expect(Object.keys(namespace).toSorted()).toEqual([
      "analytics",
      "archive",
      "public",
    ]);
    expect(namespace["public"]?.self.label).toBe("public");
    expect(namespace["public"]?.children["users"]).toEqual([
      { boost: 3, detail: "integer", label: "id", type: "primary-key" },
      { boost: 3, detail: "text", label: "email", type: "column" },
    ]);
    expect(namespace["public"]?.children["orders"]).toMatchObject({
      children: [],
      self: {
        boost: 2,
        commitCharacters: ["."],
        detail: "table",
        label: "orders",
        type: "table",
      },
    });
    expect(namespace["public"]?.self).toMatchObject({
      boost: 1,
      commitCharacters: ["."],
      detail: "schema",
      type: "namespace",
    });
    expect(namespace["analytics"]?.children["Daily Rollup"]).toMatchObject({
      self: { detail: "view", type: "view" },
    });
    expect(namespace["analytics"]?.children["rollup_cache"]).toMatchObject({
      self: { detail: "materialized view", type: "materialized-view" },
    });
  });
});

describe("isRelationPosition", () => {
  it("is true while a relation reference is being typed", () => {
    expect(isRelationPosition("SELECT * FROM ")).toBe(true);
    expect(isRelationPosition("SELECT * FROM cr")).toBe(true);
    expect(isRelationPosition("select * from crm.")).toBe(true);
    expect(isRelationPosition('FROM "Mixed')).toBe(true);
    expect(isRelationPosition("FROM a JOIN ")).toBe(true);
  });

  it("is false once the reference is complete", () => {
    expect(isRelationPosition("SELECT ")).toBe(false);
    expect(isRelationPosition("SELECT * FROM crm.customer ")).toBe(false);
    expect(isRelationPosition("SELECT * FROM crm.customer c WHERE c.")).toBe(
      false
    );
    expect(isRelationPosition("SELECT fromage")).toBe(false);
  });
});
