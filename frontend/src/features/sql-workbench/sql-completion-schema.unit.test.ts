import { describe, expect, it } from "@rstest/core";
import {
  buildCompletionNamespace,
  type CompletionRelation,
  extractReferencedRelations,
  relationKey,
} from "@/features/sql-workbench/sql-completion-schema";

const RELATIONS: CompletionRelation[] = [
  { kind: "table", name: "users", schema: "public" },
  { kind: "table", name: "orders", schema: "public" },
  { kind: "table", name: "orders", schema: "archive" },
  { kind: "view", name: "Daily Rollup", schema: "analytics" },
  { kind: "table", name: "events", schema: "analytics" },
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
          { name: "id", type: "integer" },
          { name: "email", type: "text" },
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
      { boost: 1, detail: "integer", label: "id", type: "property" },
      { boost: 1, detail: "text", label: "email", type: "property" },
    ]);
    expect(namespace["public"]?.children["orders"]).toMatchObject({
      children: [],
      self: { detail: "table", label: "orders" },
    });
    expect(namespace["analytics"]?.children["Daily Rollup"]).toMatchObject({
      self: { detail: "view", type: "interface" },
    });
  });
});
