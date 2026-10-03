import { describe, expect, it } from "@rstest/core";
import {
  completionClause,
  contextOptions,
  scopedColumns,
  statementAround,
} from "@/features/sql-workbench/sql-completion-context";
import { relationKey } from "@/features/sql-workbench/sql-relation";

describe("completionClause", () => {
  it("treats the first word of a statement as the statement keyword", () => {
    expect(completionClause("")).toBe("statement");
    expect(completionClause("SEL")).toBe("statement");
  });

  it("reads the column list and conditions as expressions", () => {
    expect(completionClause("SELECT ")).toBe("expression");
    expect(completionClause("SELECT st")).toBe("expression");
    expect(completionClause("SELECT id FROM orders WHERE sta")).toBe(
      "expression"
    );
    expect(completionClause("SELECT 1 FROM a JOIN b ON a.id = ")).toBe(
      "expression"
    );
    expect(completionClause("SELECT a FROM t ORDER BY ")).toBe("expression");
  });

  it("reads FROM and JOIN targets as relations", () => {
    expect(completionClause("SELECT * FROM ")).toBe("relation");
    expect(completionClause("SELECT * FROM orders o JOIN ")).toBe("relation");
  });

  it("suggests nothing while an alias is being named", () => {
    expect(completionClause("SELECT count(*) AS ")).toBe("alias");
    expect(completionClause("SELECT count(*) AS n, st")).toBe("expression");
  });

  it("ignores keywords inside strings, comments and finished sub-queries", () => {
    expect(completionClause("SELECT 'from x' , ")).toBe("expression");
    expect(completionClause("SELECT 1 -- from t\n, ")).toBe("expression");
    expect(
      completionClause("SELECT * FROM t WHERE id IN (SELECT id FROM u) AND ")
    ).toBe("expression");
  });

  it("reads an open sub-query on its own", () => {
    expect(completionClause("SELECT * FROM t WHERE id IN (SELECT ")).toBe(
      "expression"
    );
    expect(
      completionClause("SELECT * FROM t WHERE id IN (SELECT id FROM ")
    ).toBe("relation");
  });
});

describe("contextOptions", () => {
  const none = { fromSchema: [], inScope: [] };

  it("offers only statement keywords at the start", () => {
    const labels = contextOptions("statement", none).map((o) => o.label);
    expect(labels).toContain("SELECT");
    expect(labels).not.toContain("STDIN");
  });

  it("keeps the expression keyword list short and relevant", () => {
    const labels = contextOptions("expression", none).map((o) => o.label);
    expect(labels).toContain("DISTINCT");
    expect(labels).toContain("count");
    expect(labels).not.toContain("STDIN");
    expect(labels).not.toContain("STYLE");
  });

  it("ranks in-scope columns above functions and keywords", () => {
    const options = contextOptions("expression", {
      fromSchema: [],
      inScope: [
        {
          column: { isPrimaryKey: false, name: "status", type: "text" },
          relation: "orders",
        },
      ],
    });
    const status = options.find((o) => o.label === "status");
    const count = options.find((o) => o.label === "count");
    const distinct = options.find((o) => o.label === "DISTINCT");
    expect(status?.detail).toBe("text · orders");
    expect(status?.boost ?? 0).toBeGreaterThan(count?.boost ?? 0);
    expect(count?.boost ?? 0).toBeGreaterThan(distinct?.boost ?? 0);
  });
});

describe("scopedColumns", () => {
  const column = { isPrimaryKey: false, name: "status", type: "text" };
  const columnsByRelation = new Map([
    [relationKey({ name: "orders", schema: "commerce" }), [column]],
  ]);
  const relations = [
    {
      isMaterialized: false,
      kind: "table" as const,
      name: "orders",
      schema: "commerce",
    },
  ];

  it("uses the referenced relations when there are any", () => {
    const scoped = scopedColumns({
      columnsByRelation,
      defaultSchema: "public",
      referenced: [{ name: "orders", schema: "commerce" }],
      relations,
    });
    expect(scoped.inScope).toEqual([{ column, relation: "commerce.orders" }]);
    expect(scoped.fromSchema).toEqual([]);
  });

  it("falls back to the default schema's tables before FROM is written", () => {
    const scoped = scopedColumns({
      columnsByRelation,
      defaultSchema: "commerce",
      referenced: [],
      relations,
    });
    expect(scoped.fromSchema).toEqual([{ column, relation: "orders" }]);
  });
});

describe("statementAround", () => {
  it("sees a FROM that follows the cursor", () => {
    const doc = "SELECT st FROM orders";
    expect(statementAround(doc, 9)).toEqual({
      before: "SELECT st",
      full: "SELECT st FROM orders",
    });
  });

  it("starts a new statement after a semicolon", () => {
    const doc = "SELECT 1; ";
    expect(statementAround(doc, doc.length)).toEqual({ before: " ", full: "" });
  });

  it("keeps trailing whitespace inside an unterminated statement", () => {
    const doc = "SELECT ";
    expect(statementAround(doc, doc.length).before).toBe("SELECT ");
  });
});
