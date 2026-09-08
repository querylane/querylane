import { describe, expect, it } from "@rstest/core";
import { problemRange, type SqlProblem } from "./sql-diagnostics";
import type { SqlStatement } from "./sql-statements";

function problem(position: number): SqlProblem {
  return { detail: "", hint: "", message: "boom", position, sqlstate: "42601" };
}

describe("problemRange", () => {
  const statement: SqlStatement = {
    from: 10,
    text: 'SELECT id FORM "My Table"',
    to: 35,
  };

  it("underlines the token PostgreSQL pointed at", () => {
    expect(problemRange(statement, problem(11))).toEqual({ from: 20, to: 24 });
  });

  it("treats a quoted identifier as one token", () => {
    expect(problemRange(statement, problem(16))).toEqual({ from: 25, to: 35 });
  });

  it("covers a schema-qualified name as one token", () => {
    const qualified: SqlStatement = {
      from: 0,
      text: 'SELECT id FROM crm."Cust mer" WHERE id = 1',
      to: 42,
    };
    expect(problemRange(qualified, problem(16))).toEqual({ from: 15, to: 29 });
  });

  it("covers a string literal as one token", () => {
    const literal: SqlStatement = {
      from: 0,
      text: "SELECT 'a''b'::int",
      to: 18,
    };
    expect(problemRange(literal, problem(8))).toEqual({ from: 7, to: 13 });
  });

  it("falls back to the whole statement without a position", () => {
    expect(problemRange(statement, problem(0))).toEqual({ from: 10, to: 35 });
    expect(problemRange(statement, problem(99))).toEqual({ from: 10, to: 35 });
  });

  it("counts positions in code points, not UTF-16 units", () => {
    const emoji: SqlStatement = { from: 0, text: "SELECT '😀' FORM t", to: 17 };
    expect(problemRange(emoji, problem(12))).toEqual({ from: 12, to: 16 });
  });
});
