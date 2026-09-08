import type { SqlStatement } from "@/features/sql-workbench/sql-statements";

/**
 * One problem PostgreSQL reported for a statement. `position` is the
 * server's 1-based character offset into the statement, or 0 when unknown.
 */
interface SqlProblem {
  detail: string;
  hint: string;
  message: string;
  position: number;
  sqlstate: string;
}

/** Where a problem sits in the editor document. */
interface SqlProblemRange {
  from: number;
  to: number;
}

// Code points from here up take two UTF-16 units.
const ASTRAL_PLANE_START = 0x1_00_00;
// The token under the server's position: a possibly qualified identifier
// such as crm."Customer", a string literal, a number, or a single symbol.
const IDENTIFIER_PART = String.raw`(?:"(?:[^"]|"")+"|[\p{L}_][\p{L}\p{N}_$]*)`;
const STRING_LITERAL = "'(?:[^']|'')*'";
const TOKEN_PATTERN = new RegExp(
  String.raw`^(?:${IDENTIFIER_PART}(?:\.${IDENTIFIER_PART})*|${STRING_LITERAL}|\d+(?:\.\d+)?|\S)`,
  "u"
);

/**
 * PostgreSQL counts positions in characters (code points); JavaScript
 * offsets are UTF-16 code units. They differ only past the first astral
 * character, but a wrong underline is worse than none.
 */
function codePointOffsetToIndex(text: string, codePoints: number): number {
  let index = 0;
  let remaining = codePoints;
  while (remaining > 0 && index < text.length) {
    const code = text.codePointAt(index) ?? 0;
    index += code >= ASTRAL_PLANE_START ? 2 : 1;
    remaining -= 1;
  }
  return index;
}

/**
 * Maps a problem onto the document: the token PostgreSQL pointed at, or the
 * whole statement when it gave no position.
 */
function problemRange(
  statement: SqlStatement,
  problem: SqlProblem
): SqlProblemRange {
  if (problem.position <= 0) {
    return { from: statement.from, to: statement.to };
  }
  const offset = codePointOffsetToIndex(statement.text, problem.position - 1);
  if (offset >= statement.text.length) {
    return { from: statement.from, to: statement.to };
  }
  const token = TOKEN_PATTERN.exec(statement.text.slice(offset));
  const length = token ? token[0].length : 1;
  return {
    from: statement.from + offset,
    to: statement.from + offset + length,
  };
}

export type { SqlProblem, SqlProblemRange };
export { problemRange };
