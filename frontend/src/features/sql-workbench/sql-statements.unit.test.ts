import { describe, expect, it } from "@rstest/core";
import {
  resolveRunnableStatement,
  splitSqlStatements,
  statementAtCursor,
} from "@/features/sql-workbench/sql-statements";

describe("splitSqlStatements", () => {
  it("splits on top-level semicolons and trims each statement", () => {
    const statements = splitSqlStatements(
      "  select 1;\n\nselect 2 ;\nselect 3"
    );
    expect(statements.map((statement) => statement.text)).toEqual([
      "select 1",
      "select 2",
      "select 3",
    ]);
    expect(statements[0]).toMatchObject({ from: 2, to: 10 });
  });

  it("ignores semicolons inside string literals and quoted identifiers", () => {
    const statements = splitSqlStatements(
      `select 'a;b', "weird;name" from t; select 'it''s;fine'`
    );
    expect(statements.map((statement) => statement.text)).toEqual([
      `select 'a;b', "weird;name" from t`,
      `select 'it''s;fine'`,
    ]);
  });

  it("ignores semicolons inside dollar-quoted strings", () => {
    const statements = splitSqlStatements(
      "select $$a;b$$; select $fn$ x; y $fn$; select $1"
    );
    expect(statements.map((statement) => statement.text)).toEqual([
      "select $$a;b$$",
      "select $fn$ x; y $fn$",
      "select $1",
    ]);
  });

  it("ignores semicolons inside comments and drops comment-only chunks", () => {
    const statements = splitSqlStatements(
      "-- leading; comment\nselect /* a; b */ 1; /* trailing; */\n-- done;"
    );
    expect(statements.map((statement) => statement.text)).toEqual([
      "-- leading; comment\nselect /* a; b */ 1",
    ]);
  });

  it("handles escape strings with backslash-escaped quotes", () => {
    const statements = splitSqlStatements(
      String.raw`select E'a\';b'; select 2`
    );
    expect(statements.map((statement) => statement.text)).toEqual([
      String.raw`select E'a\';b'`,
      "select 2",
    ]);
  });

  it("returns no statements for blank input", () => {
    expect(splitSqlStatements("   \n;;\n")).toEqual([]);
  });
});

describe("statementAtCursor", () => {
  const statements = splitSqlStatements("select 1;\n\nselect 2;\n\nselect 3");

  it("returns the statement containing the cursor", () => {
    expect(statementAtCursor(statements, 13)?.text).toBe("select 2");
  });

  it("returns the preceding statement when the cursor sits in whitespace", () => {
    expect(statementAtCursor(statements, 10)?.text).toBe("select 1");
  });

  it("falls back to the first statement before any text", () => {
    expect(statementAtCursor(splitSqlStatements("\n\nselect 9"), 0)?.text).toBe(
      "select 9"
    );
  });

  it("returns undefined without statements", () => {
    expect(statementAtCursor([], 0)).toBeUndefined();
  });
});

describe("resolveRunnableStatement", () => {
  it("prefers a non-empty selection and strips its trailing semicolon", () => {
    const text = "select 1;\nselect 2;";
    expect(
      resolveRunnableStatement({
        cursor: 0,
        selection: { from: 10, to: text.length },
        text,
      })
    ).toMatchObject({ text: "select 2" });
  });

  it("returns null for a comment-only selection", () => {
    const text = "-- note\nselect 1";
    expect(
      resolveRunnableStatement({
        cursor: 0,
        selection: { from: 0, to: 7 },
        text,
      })
    ).toBeNull();
  });

  it("uses the statement at the cursor when nothing is selected", () => {
    const text = "select 1;\nselect 2;";
    expect(
      resolveRunnableStatement({
        cursor: text.length,
        selection: { from: 5, to: 5 },
        text,
      })
    ).toMatchObject({ text: "select 2" });
  });
});
